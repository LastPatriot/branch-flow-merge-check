import { checkBranchFlow } from './rules.js';
import { decideAutoMerge } from './automerge.js';
import { getPullRequest, mergePullRequest } from './bitbucket.js';

// Merge check (bitbucket:mergeCheck).
//
// The event only identifies the pull request (event.pullrequest.id plus workspace and
// repository UUIDs); it carries no branch names. So the handler fetches the pull request
// from the Bitbucket REST API (needs read:pullrequest:bitbucket) and reads
// source.branch.name and destination.branch.name from it.
export const validateBranchFlow = async (event) => {
  const prId = event.pullrequest.id;
  const res = await getPullRequest(event.workspace.uuid, event.repository.uuid, prId);

  if (!res.ok) {
    // Fail closed: a check that can't read the PR must not let it through.
    return {
      success: false,
      message: `Could not read pull request #${prId} to check its branches (HTTP ${res.status}). Re-run the check or contact platform engineering.`,
    };
  }

  const sourceBranch = res.pr.source?.branch?.name;
  const targetBranch = res.pr.destination?.branch?.name;
  if (!sourceBranch || !targetBranch) {
    return {
      success: false,
      message: `Pull request #${prId} has no source or destination branch name, so its branch flow can't be checked.`,
    };
  }

  return checkBranchFlow(sourceBranch, targetBranch);
};

// Auto-merge trigger (avi:bitbucket:updated:pullrequest-reviewer-status).
//
// Fires when a reviewer approves, requests changes, or has their status cleared. It re-reads
// the PR and, when it is open, the branch flow is allowed, it has at least one approval and
// nobody has requested changes, asks Bitbucket to merge it.
//
// This complements Bitbucket's "Minimum number of approvals" and "Minimum number of approvals
// from default reviewers" merge checks: Bitbucket refuses the merge until every configured
// minimum for the target branch is met, so the approval that meets the last one merges.
// Configure with a Forge environment variable:
//   AUTO_MERGE_TARGETS  comma-separated target branches; `vN/*` = any version line (default dev,test,prod,vN/*)
export const autoMergeOnApproval = async (event) => {
  const prId = event.pullrequest?.id;
  const workspaceUuid = event.workspace?.uuid;
  const repoUuid = event.repository?.uuid;
  if (!prId || !workspaceUuid || !repoUuid) {
    console.log('auto-merge: event has no pull request, workspace or repository id; skipping');
    return;
  }

  const res = await getPullRequest(workspaceUuid, repoUuid, prId);
  if (!res.ok) {
    console.error(`auto-merge: could not read PR #${prId} (HTTP ${res.status})`);
    return;
  }

  const decision = decideAutoMerge(res.pr, { targets: process.env.AUTO_MERGE_TARGETS });
  if (!decision.merge) {
    console.log(`auto-merge: PR #${prId} not merged: ${decision.reason}`);
    return;
  }

  const merged = await mergePullRequest(workspaceUuid, repoUuid, prId, {
    closeSourceBranch: decision.closeSourceBranch,
  });
  if (merged.ok) {
    console.log(`auto-merge: PR #${prId} merged (HTTP ${merged.status})`);
  } else {
    // Expected until the branch's approval minimums (including default reviewers) are met.
    // Other causes: required builds not passed yet, another branch restriction, or a failed merge check.
    console.log(`auto-merge: PR #${prId} not merged yet, Bitbucket refused (HTTP ${merged.status}): ${merged.body}`);
  }
};
