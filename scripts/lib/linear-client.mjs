/**
 * Thin wrapper around Linear's GraphQL API (https://developers.linear.app/docs/graphql/working-with-the-graphql-api).
 * No dependency – uses the built-in `fetch`. Every function takes the API key explicitly rather
 * than reading `process.env` itself, so callers control where the key comes from and tests never
 * need to touch real environment state.
 */

const LINEAR_GRAPHQL_URL = 'https://api.linear.app/graphql';

/**
 * @param {string} apiKey Linear Personal API key. Sent as a raw `Authorization` header value –
 *   Linear's API does not use a `Bearer` prefix.
 * @param {string} query GraphQL query or mutation document.
 * @param {Record<string, unknown>} [variables] GraphQL variables.
 * @param {typeof fetch} [fetchImpl] Injectable for tests.
 * @returns {Promise<Record<string, unknown>>} The `data` field of the GraphQL response.
 * @throws {Error} On a network failure, non-OK HTTP status, or a GraphQL `errors` array.
 */
export async function linearRequest(apiKey, query, variables = {}, fetchImpl = fetch) {
    const response = await fetchImpl(LINEAR_GRAPHQL_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: apiKey },
        body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
        throw new Error(`Linear API request failed: ${response.status} ${response.statusText}`);
    }

    const json = await response.json();

    if (json.errors) {
        throw new Error(`Linear API error: ${JSON.stringify(json.errors)}`);
    }

    return json.data;
}

const FIND_TRACKING_ISSUE_QUERY = `
    query FindTrackingIssue($teamId: String!, $titlePrefix: String!) {
        issues(
            filter: {
                team: { id: { eq: $teamId } }
                title: { startsWithIgnoreCase: $titlePrefix }
                state: { type: { nin: ["completed", "canceled"] } }
            }
            first: 5
            orderBy: createdAt
        ) {
            nodes {
                id
                identifier
                title
            }
        }
    }
`;

/**
 * @param {string} apiKey
 * @param {{ teamId: string, titlePrefix: string }} params
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<{ id: string, identifier: string, title: string } | null>} The first open
 *   issue whose title starts with `titlePrefix` in the given team, or `null` if none exists.
 */
export async function findTrackingIssue(apiKey, { teamId, titlePrefix }, fetchImpl = fetch) {
    const data = await linearRequest(apiKey, FIND_TRACKING_ISSUE_QUERY, { teamId, titlePrefix }, fetchImpl);
    const nodes = /** @type {{ issues: { nodes: { id: string, identifier: string, title: string }[] } }} */ (data)
        .issues.nodes;

    return nodes[0] ?? null;
}

const RESOLVE_LABEL_IDS_QUERY = `
    query ResolveLabelIds($teamId: String!, $names: [String!]!) {
        issueLabels(filter: { team: { id: { eq: $teamId } }, name: { in: $names } }) {
            nodes {
                id
                name
            }
        }
    }
`;

/**
 * @param {string} apiKey
 * @param {{ teamId: string, names: string[] }} params
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<Record<string, string>>} Map of label name to label id, for whichever of
 *   `names` actually exist on the team.
 */
export async function resolveLabelIds(apiKey, { teamId, names }, fetchImpl = fetch) {
    const data = await linearRequest(apiKey, RESOLVE_LABEL_IDS_QUERY, { teamId, names }, fetchImpl);
    const nodes = /** @type {{ issueLabels: { nodes: { id: string, name: string }[] } }} */ (data).issueLabels.nodes;

    return Object.fromEntries(nodes.map((node) => [node.name, node.id]));
}

const CREATE_ISSUE_MUTATION = `
    mutation CreateIssue($input: IssueCreateInput!) {
        issueCreate(input: $input) {
            success
            issue {
                id
                identifier
            }
        }
    }
`;

/**
 * @param {string} apiKey
 * @param {{ teamId: string, title: string, description: string, labelIds: string[], assigneeId: string, projectId: string }} params
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<{ id: string, identifier: string }>} The created issue.
 * @throws {Error} When Linear reports `success: false`.
 */
export async function createIssue(
    apiKey,
    { teamId, title, description, labelIds, assigneeId, projectId },
    fetchImpl = fetch,
) {
    const data = await linearRequest(
        apiKey,
        CREATE_ISSUE_MUTATION,
        { input: { teamId, title, description, labelIds, assigneeId, projectId } },
        fetchImpl,
    );
    const result = /** @type {{ issueCreate: { success: boolean, issue: { id: string, identifier: string } } }} */ (
        data
    ).issueCreate;

    if (!result.success) {
        throw new Error('Linear issueCreate reported success: false');
    }

    return result.issue;
}

const ADD_COMMENT_MUTATION = `
    mutation AddComment($issueId: String!, $body: String!) {
        commentCreate(input: { issueId: $issueId, body: $body }) {
            success
            comment {
                id
            }
        }
    }
`;

/**
 * @param {string} apiKey
 * @param {{ issueId: string, body: string }} params
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<{ id: string }>} The created comment.
 * @throws {Error} When Linear reports `success: false`.
 */
export async function addComment(apiKey, { issueId, body }, fetchImpl = fetch) {
    const data = await linearRequest(apiKey, ADD_COMMENT_MUTATION, { issueId, body }, fetchImpl);
    const result = /** @type {{ commentCreate: { success: boolean, comment: { id: string } } }} */ (data).commentCreate;

    if (!result.success) {
        throw new Error('Linear commentCreate reported success: false');
    }

    return result.comment;
}
