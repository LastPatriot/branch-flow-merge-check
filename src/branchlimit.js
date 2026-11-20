// Branch count limit. Pure functions: no Forge or network code, so they can be tested directly.
//
// Blocks merges while the repository has more than the allowed number of branches (default 8,
// counting every branch: dev, test and prod too). Bitbucket Cloud can't stop a branch from being
// created, so this makes the team delete stale branches before anything else merges.
//
// The PR's own source branch is not counted when the PR will close it on merge: merging then
// brings the repository closer to the limit, so that PR shouldn't be held back.
//
// Configure with a Forge environment variable:
//   MAX_BRANCHES  positive integer (default 8)

export const DEFAULT_MAX_BRANCHES = 8;

export function parseMaxBranches(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_MAX_BRANCHES;
}

// branches: branch names in the repository. sourceBranch / closesSourceBranch: from the PR.
export function branchLimitResult(branches, { max, sourceBranch, closesSourceBranch }) {
  const counted = closesSourceBranch ? branches.filter((b) => b !== sourceBranch) : branches;

  if (counted.length <= max) {
    return { success: true, message: `Repository has ${counted.length} of ${max} allowed branches.` };
  }

  const names = [...counted].sort();
  const shown = names.slice(0, 15).join(', ');
  const more = names.length > 15 ? `, and ${names.length - 15} more` : '';
  const note = closesSourceBranch ? ` (not counting '${sourceBranch}', which this PR deletes on merge)` : '';
  return {
    success: false,
    message: `Repository has ${counted.length} branches${note}, more than the limit of ${max}. Delete ${counted.length - max} stale branch(es) before merging. Branches: ${shown}${more}.`,
  };
}
