// Auto-merge decision. Pure function: no Forge or network code, so it can be tested directly.
import { checkBranchFlow, isVersionLine } from './rules.js';

// Branches that must never be deleted by a merge, even if the PR asks to close its source branch.
const LONG_LIVED = ['dev', 'test', 'prod'];
const isLongLived = (branch) => LONG_LIVED.includes(branch) || isVersionLine(branch);

// Target branches auto-merge applies to: a comma-separated list.
//   vN/*    any version line (v2/*, v3/*, ...)
//   v3/*    one specific line (any `prefix/*` matches branches starting with `prefix/`)
//   dev     an exact branch name
// prod is included: its approvals are governed by Bitbucket's "Minimum number of approvals
// from default reviewers", which Bitbucket enforces on the merge the app requests.
export const DEFAULT_TARGETS = 'dev,test,prod,vN/*';

export function targetAllowed(targetBranch, targetsSetting) {
  const patterns = (targetsSetting || DEFAULT_TARGETS)
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  return patterns.some((p) => {
    if (p === 'vN/*') return isVersionLine(targetBranch);
    if (p.endsWith('/*')) return targetBranch.startsWith(p.slice(0, -1));
    return targetBranch === p;
  });
}

// pr: the Bitbucket REST pull request object. config: { targets }.
// Returns { merge: true, closeSourceBranch } or { merge: false, reason }.
//
// The approval count is NOT decided here. It complements Bitbucket's own merge checks,
// "Minimum number of approvals" and "Minimum number of approvals from default reviewers"
// (e.g. on prod): once a PR has at least one approval and no "changes requested", the app
// asks Bitbucket to merge, and Bitbucket refuses until every configured minimum for that
// branch is met. Those settings stay the single source of truth.
export function decideAutoMerge(pr, config = {}) {
  const source = pr.source?.branch?.name;
  const target = pr.destination?.branch?.name;

  if (pr.state !== 'OPEN') return { merge: false, reason: `PR is ${pr.state}, not OPEN` };
  if (!source || !target) return { merge: false, reason: 'PR has no source or destination branch name' };
  if (!targetAllowed(target, config.targets)) return { merge: false, reason: `auto-merge is not enabled for target '${target}'` };

  const flow = checkBranchFlow(source, target);
  if (!flow.success) return { merge: false, reason: `branch flow not allowed: ${flow.message}` };

  const participants = pr.participants || [];
  if (participants.some((p) => p.state === 'changes_requested')) {
    return { merge: false, reason: 'a reviewer has requested changes' };
  }
  if (!participants.some((p) => p.approved === true)) {
    return { merge: false, reason: 'no approvals yet' };
  }

  return { merge: true, closeSourceBranch: pr.close_source_branch === true && !isLongLived(source) };
}
