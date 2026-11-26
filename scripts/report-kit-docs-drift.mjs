#!/usr/bin/env node
/**
 * Runs `checkKitDocsDrift` and, when drift is found, files or updates a tracking issue in Linear
 * (team BLIT386 / BT) describing which `packages/kit/content/docs/*.md` files should be reviewed.
 *
 * CI-only (`.github/workflows/kit-docs-drift.yml`) - not part of `pnpm run preflight` or any
 * `quality-root` step, since it needs a live `LINEAR_API_KEY` and makes a real network call.
 * Never a required check on drift: finding drift exits 0, as does an unset `LINEAR_API_KEY`, so a
 * standing content-review backlog never shows as a red workflow run - the Linear issue/comment is
 * the only signal. A run that cannot do its job (the drift check throws, e.g. on a missing
 * `_api-history.json`; the Linear call fails; or a clean run finds the key rejected, e.g. an expired
 * key) exits 1, so a dead reporter is visible.
 *
 * Usage:
 *   LINEAR_API_KEY=... node scripts/report-kit-docs-drift.mjs
 */

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkKitDocsDrift } from './check-kit-docs-drift.mjs';
import { addComment, createIssue, findTrackingIssue, resolveLabelIds, verifyApiKey } from './lib/linear-client.mjs';

/** BLIT386 team (key `BT`) id, from `list_teams`. Structural, low-churn - see BT-293 plan. */
export const LINEAR_TEAM_ID = '1d6b360b-cb57-4f44-9b47-f729b13538ee';

/** BLIT386 project id, from `list_projects`. */
export const LINEAR_PROJECT_ID = 'f9647046-9131-4acb-82d8-ec662d4df766';

/** Václav Vančura's Linear user id, from `list_users`. */
export const LINEAR_ASSIGNEE_ID = '77605828-2f2f-43a7-bbe6-e4b741b57c06';

/** Both must already exist on the BT team - confirmed live when this was written. */
export const TRACKING_ISSUE_LABEL_NAMES = ['doc', 'create-blit386'];

/** Stable prefix used to find (and reuse) an existing open tracking issue instead of spamming a new one each run. */
export const TRACKING_ISSUE_TITLE = 'docs(kit): kit docs need review against a newer blit386 release';

/**
 * Last line of every report body. The API key is a personal key, so a reporter comment and a human reply
 * share one Linear author; the line is the only thing that tells them apart. Plain text, not an HTML
 * comment, so Linear's markdown round trip keeps it.
 */
export const REPORT_MARKER = '_Posted by the Kit Docs Drift workflow._';

/**
 * @param {import('./check-kit-docs-drift.mjs').DriftReport} report
 * @returns {string} Markdown body listing which docs to review and why.
 */
export function formatDriftBody(report) {
    const lines = [
        `blit386 is at **${report.engineVersion}**; \`packages/kit/package.json\`'s \`blit386.docsReviewedAt\` is still` +
            ` **${report.docsReviewedAt}**.`,
        '',
        'These kit docs describe engine API areas that changed since the last review - check them against',
        `\`packages/blit386/docs/changelog.md\` and the affected \`docs/api-*.md\` pages, then bump` +
            ' `docsReviewedAt` once confirmed current:',
        '',
    ];

    for (const { docFile, pages } of report.dueDocs) {
        lines.push(`- \`packages/kit/${docFile}\` - changed: ${pages.join(', ')}`);
    }

    lines.push('', REPORT_MARKER);

    return lines.join('\n');
}

/**
 * Linear hands markdown back normalized (for one, `* ` bullets for `- `), so compare on a canonical form.
 * @param {string} text
 * @returns {string}
 */
function canonical(text) {
    return text.trim().replace(/^[*-] /gmu, '- ');
}

/**
 * @param {{ apiKey: string, report: import('./check-kit-docs-drift.mjs').DriftReport, log?: (message: string) => void }} options
 * @returns {Promise<void>}
 */
export async function reportDrift({ apiKey, report, log = console.log }) {
    const body = formatDriftBody(report);
    const existing = await findTrackingIssue(apiKey, { teamId: LINEAR_TEAM_ID, titlePrefix: TRACKING_ISSUE_TITLE });

    if (existing) {
        // Newest by createdAt, not by position: the connection's order is not something to rely on.
        // Only the reporter's own comments count, so a human reply never makes the next run repost.
        // Legacy shortcut: with no marked comment (reports from before the marker), any comment counts, so
        // the first run after the marker lands may repost once; drop it when that issue is long closed.
        const comments = existing.comments?.nodes ?? [];
        const own = comments.filter((comment) => comment.body.includes(REPORT_MARKER));
        const latest = (own.length > 0 ? own : comments).reduce(
            (a, b) => (!a || b.createdAt > a.createdAt ? b : a),
            undefined,
        );

        // A fresh issue holds the report in its description and has no comments yet.
        const previous = latest?.body ?? existing.description;

        if (previous !== undefined && previous !== null && canonical(previous) === canonical(body)) {
            log(`Tracking issue ${existing.identifier} already has this drift report; not commenting again.`);
            return;
        }

        await addComment(apiKey, { issueId: existing.id, body });
        log(`Updated existing tracking issue ${existing.identifier} with the latest drift report.`);
        return;
    }

    const labelIds = await resolveLabelIds(apiKey, { teamId: LINEAR_TEAM_ID, names: TRACKING_ISSUE_LABEL_NAMES });
    const missing = TRACKING_ISSUE_LABEL_NAMES.filter((name) => !(name in labelIds));

    // Warn rather than fail: a renamed label must not stop the drift report itself from reaching Linear.
    if (missing.length > 0) {
        log(`Warning: Linear label(s) not found on the team, filing without them: ${missing.join(', ')}.`);
    }

    const created = await createIssue(apiKey, {
        teamId: LINEAR_TEAM_ID,
        projectId: LINEAR_PROJECT_ID,
        assigneeId: LINEAR_ASSIGNEE_ID,
        title: TRACKING_ISSUE_TITLE,
        description: body,
        labelIds: Object.values(labelIds),
    });
    log(`Filed new tracking issue ${created.identifier}.`);
}

/**
 * CLI entry point. Resolves to 1 only when checking, verifying the key, or reporting fails - see file
 * header. Dependencies are injectable so tests can drive every exit path without Linear or the repo.
 * @param {{ env?: Record<string, string | undefined>, check?: typeof checkKitDocsDrift, report?: typeof reportDrift,
 *   verify?: typeof verifyApiKey }} [deps]
 * @returns {Promise<number>}
 */
export async function main({
    env = process.env,
    check = checkKitDocsDrift,
    report: send = reportDrift,
    verify = verifyApiKey,
} = {}) {
    let report;

    try {
        report = check();
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Failed to check kit docs drift: ${message}`);
        return 1;
    }

    const apiKey = env.LINEAR_API_KEY;

    if (!report.drift) {
        console.log(`Kit docs OK (no engine API changes since docsReviewedAt ${report.docsReviewedAt}).`);

        // A clean run sends nothing, so prove the key still works: a dead key must not wait for the first drift.
        if (apiKey) {
            try {
                await verify(apiKey);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                console.error(`LINEAR_API_KEY check failed: ${message}`);
                return 1;
            }
        }

        return 0;
    }

    if (!apiKey) {
        console.log('Kit docs drift detected, but LINEAR_API_KEY is not set - skipping Linear filing.');
        console.log(formatDriftBody(report));
        return 0;
    }

    try {
        await send({ apiKey, report });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Failed to report kit docs drift to Linear: ${message}`);
        return 1;
    }

    return 0;
}

const isDirectRun = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isDirectRun) {
    process.exitCode = await main();
}
