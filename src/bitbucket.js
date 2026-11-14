import api, { route } from '@forge/api';

const MAX_PAGES = 20;

// Reads every page of a paginated Bitbucket list. pageRoute(page) builds the route for one page
// (page is undefined for the first). Stops after MAX_PAGES and marks the result as truncated.
async function getAllPages(pageRoute) {
  const values = [];
  let page;
  for (let i = 0; i < MAX_PAGES; i++) {
    const res = await api.asApp().requestBitbucket(pageRoute(page));
    if (!res.ok) return { ok: false, status: res.status };
    const body = await res.json();
    values.push(...(body.values || []));
    if (!body.next) return { ok: true, values };
    page = new URL(body.next).searchParams.get('page');
    if (!page) return { ok: true, values };
  }
  values.truncated = true;
  return { ok: true, values };
}

// Fetches the full pull request (branch names, state, participants) as the app.
export async function getPullRequest(workspaceUuid, repoUuid, prId) {
  const res = await api
    .asApp()
    .requestBitbucket(route`/2.0/repositories/${workspaceUuid}/${repoUuid}/pullrequests/${prId}`);
  if (!res.ok) {
    return { ok: false, status: res.status };
  }
  return { ok: true, pr: await res.json() };
}

// Files changed by the pull request (status, old.path, new.path).
export function getPullRequestDiffstat(workspaceUuid, repoUuid, prId) {
  return getAllPages((page) =>
    page
      ? route`/2.0/repositories/${workspaceUuid}/${repoUuid}/pullrequests/${prId}/diffstat?pagelen=100&page=${page}`
      : route`/2.0/repositories/${workspaceUuid}/${repoUuid}/pullrequests/${prId}/diffstat?pagelen=100`
  );
}

// Commits in the pull request, newest first.
export function getPullRequestCommits(workspaceUuid, repoUuid, prId) {
  return getAllPages((page) =>
    page
      ? route`/2.0/repositories/${workspaceUuid}/${repoUuid}/pullrequests/${prId}/commits?pagelen=50&page=${page}`
      : route`/2.0/repositories/${workspaceUuid}/${repoUuid}/pullrequests/${prId}/commits?pagelen=50`
  );
}

// Posts a Markdown comment on the pull request.
export async function addPullRequestComment(workspaceUuid, repoUuid, prId, markdown) {
  const res = await api
    .asApp()
    .requestBitbucket(route`/2.0/repositories/${workspaceUuid}/${repoUuid}/pullrequests/${prId}/comments`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: { raw: markdown } }),
    });
  return { ok: res.ok, status: res.status };
}

// Merges a pull request as the app. Bitbucket still enforces branch restrictions and merge
// checks (including this app's own checks) on this call.
// No merge_strategy is sent, so the repository's default strategy is used.
export async function mergePullRequest(workspaceUuid, repoUuid, prId, { closeSourceBranch }) {
  const res = await api
    .asApp()
    .requestBitbucket(route`/2.0/repositories/${workspaceUuid}/${repoUuid}/pullrequests/${prId}/merge`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'pullrequest', close_source_branch: closeSourceBranch }),
    });
  const text = await res.text();
  return { ok: res.ok, status: res.status, body: text.slice(0, 500) };
}
