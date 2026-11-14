import { checkBranchFlow } from './rules.js';
import { decideAutoMerge } from './automerge.js';
import { configScanResult } from './configscan.js';
import { buildReleaseNotes, notesTargetAllowed } from './releasenotes.js';
import {
  addPullRequestComment,
  getPullRequest,
  getPullRequestCommits,
  getPullRequestDiffstat,
  mergePullRequest,
} from './bitbucket.js';

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
  if (event.selfGenerated) {
    console.log('auto-merge: event caused by this app; skipping');
    return;
  }
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

// Merge check (bitbucket:mergeCheck): Sensitive Config File Check.
//
// Reads the files the PR adds, changes or renames (diffstat) and blocks .env variants,
// appsettings.json and Spring Boot base config files. See src/configscan.js for the rules.
export const validateConfigFiles = async (event) => {
  const prId = event.pullrequest.id;
  const res = await getPullRequestDiffstat(event.workspace.uuid, event.repository.uuid, prId);

  if (!res.ok) {
    // Fail closed, like the branch check.
    return {
      success: false,
      message: `Could not read the changed files of pull request #${prId} (HTTP ${res.status}). Re-run the check or contact platform engineering.`,
    };
  }
  if (res.values.truncated) {
    return {
      success: false,
      message: `Pull request #${prId} changes too many files to scan completely. Split it into smaller pull requests.`,
    };
  }

  return configScanResult(res.values);
};

// Release notes trigger (avi:bitbucket:fulfilled:pullrequest).
//
// When a PR is merged into a release branch, posts release notes built from its commits as a
// comment on that PR. Configure with a Forge environment variable:
//   RELEASE_NOTES_TARGETS  comma-separated target branches (default test,prod)
export const generateReleaseNotes = async (event) => {
  const prId = event.pullrequest?.id;
  const workspaceUuid = event.workspace?.uuid;
  const repoUuid = event.repository?.uuid;
  if (!prId || !workspaceUuid || !repoUuid) {
    console.log('release-notes: event has no pull request, workspace or repository id; skipping');
    return;
  }

  const res = await getPullRequest(workspaceUuid, repoUuid, prId);
  if (!res.ok) {
    console.error(`release-notes: could not read PR #${prId} (HTTP ${res.status})`);
    return;
  }
  const pr = res.pr;
  const source = pr.source?.branch?.name;
  const target = pr.destination?.branch?.name;
  if (pr.state !== 'MERGED' || !target || !notesTargetAllowed(target, process.env.RELEASE_NOTES_TARGETS)) {
    console.log(`release-notes: PR #${prId} (${source} -> ${target}, ${pr.state}) needs no release notes`);
    return;
  }

  const commits = await getPullRequestCommits(workspaceUuid, repoUuid, prId);
  if (!commits.ok) {
    console.error(`release-notes: could not read commits of PR #${prId} (HTTP ${commits.status})`);
    return;
  }

  const notes = buildReleaseNotes(
    {
      id: prId,
      title: pr.title,
      source,
      target,
      mergeCommit: pr.merge_commit?.hash,
      mergedAt: pr.updated_on,
    },
    commits.values
  );
  const posted = await addPullRequestComment(workspaceUuid, repoUuid, prId, notes);
  if (posted.ok) {
    console.log(`release-notes: posted on PR #${prId} (${source} -> ${target})`);
  } else {
    console.error(`release-notes: could not comment on PR #${prId} (HTTP ${posted.status})`);
  }
};
