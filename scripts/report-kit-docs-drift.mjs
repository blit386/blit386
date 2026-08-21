#!/usr/bin/env node
/**
 * Runs `checkKitDocsDrift` and, when drift is found, files or updates a tracking issue in Linear
 * (team BLIT386 / BT) describing which `packages/kit/content/docs/*.md` files should be reviewed.
 *
 * CI-only (`.github/workflows/kit-docs-drift.yml`) – not part of `pnpm run preflight` or any
 * `quality-root` step, since it needs a live `LINEAR_API_KEY` and makes a real network call.
 * Never a required check: this always exits 0, drift or not, so a standing content-review backlog
 * never shows as a red workflow run – the Linear issue/comment is the only signal.
 *
 * Usage:
 *   LINEAR_API_KEY=... node scripts/report-kit-docs-drift.mjs
 */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkKitDocsDrift } from './check-kit-docs-drift.mjs';
import { addComment, createIssue, findTrackingIssue, resolveLabelIds } from './lib/linear-client.mjs';

/** BLIT386 team (key `BT`) id, from `list_teams`. Structural, low-churn – see BT-293 plan. */
export const LINEAR_TEAM_ID = '1d6b360b-cb57-4f44-9b47-f729b13538ee';

/** BLIT386 project id, from `list_projects`. */
export const LINEAR_PROJECT_ID = 'f9647046-9131-4acb-82d8-ec662d4df766';

/** Václav Vančura's Linear user id, from `list_users`. */
export const LINEAR_ASSIGNEE_ID = '77605828-2f2f-43a7-bbe6-e4b741b57c06';

/** Both must already exist on the BT team – confirmed live when this was written. */
export const TRACKING_ISSUE_LABEL_NAMES = ['doc', 'create-blit386'];

/** Stable prefix used to find (and reuse) an existing open tracking issue instead of spamming a new one each run. */
export const TRACKING_ISSUE_TITLE = 'docs(kit): kit docs need review against a newer blit386 release';

/**
 * @param {import('./check-kit-docs-drift.mjs').DriftReport} report
 * @returns {string} Markdown body listing which docs to review and why.
 */
export function formatDriftBody(report) {
    const lines = [
        `blit386 is at **${report.engineVersion}**; \`packages/kit/package.json\`'s \`blit386.docsReviewedAt\` is still` +
            ` **${report.docsReviewedAt}**.`,
        '',
        'These kit docs describe engine API areas that changed since the last review – check them against',
        `\`packages/blit386/docs/changelog.md\` and the affected \`docs/api-*.md\` pages, then bump` +
            ' `docsReviewedAt` once confirmed current:',
        '',
    ];

    for (const { docFile, pages } of report.dueDocs) {
        lines.push(`- \`packages/kit/${docFile}\` – changed: ${pages.join(', ')}`);
    }

    return lines.join('\n');
}

/**
 * @param {{ apiKey: string, report: import('./check-kit-docs-drift.mjs').DriftReport, log?: (message: string) => void }} options
 * @returns {Promise<void>}
 */
export async function reportDrift({ apiKey, report, log = console.log }) {
    const body = formatDriftBody(report);
    const existing = await findTrackingIssue(apiKey, { teamId: LINEAR_TEAM_ID, titlePrefix: TRACKING_ISSUE_TITLE });

    if (existing) {
        await addComment(apiKey, { issueId: existing.id, body });
        log(`Updated existing tracking issue ${existing.identifier} with the latest drift report.`);
        return;
    }

    const labelIds = await resolveLabelIds(apiKey, { teamId: LINEAR_TEAM_ID, names: TRACKING_ISSUE_LABEL_NAMES });
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

/** CLI entry point. Always resolves to exit code 0 – see file header. */
async function main() {
    let report;

    try {
        report = checkKitDocsDrift();
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Failed to check kit docs drift: ${message}`);
        return 0;
    }

    if (!report.drift) {
        console.log(`Kit docs OK (no engine API changes since docsReviewedAt ${report.docsReviewedAt}).`);
        return 0;
    }

    const apiKey = process.env.LINEAR_API_KEY;

    if (!apiKey) {
        console.log('Kit docs drift detected, but LINEAR_API_KEY is not set – skipping Linear filing.');
        console.log(formatDriftBody(report));
        return 0;
    }

    try {
        await reportDrift({ apiKey, report });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Failed to report kit docs drift to Linear: ${message}`);
    }

    return 0;
}

const isDirectRun = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isDirectRun) {
    process.exitCode = await main();
}
