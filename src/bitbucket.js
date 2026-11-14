import api, { route } from '@forge/api';

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

// Merges a pull request as the app. Bitbucket still enforces branch restrictions and merge
// checks (including this app's own Git Branching Strategy Validator) on this call.
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
