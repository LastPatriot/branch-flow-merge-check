// Team branching strategy. Pure function: no Forge or network code, so it can be tested directly.
//
//   Rule 1: vN/*                    may NOT merge into dev, test or prod
//   Rule 2: only fix/* or feature/* may merge into dev
//   Rule 3: only dev                may merge into test
//   Rule 4: only test or hotfix/*   may merge into prod
//   Rule 5: only feature/*          may merge into vN/*
//
// vN/* is a version line: `v` + a number + `/` (v2/main, v3/payments, v10/x).
// Branches that merely start with a v (vendor/x, video-fix) are not version lines.
// Any other target branch is not restricted by this check.

const PROTECTED_TARGETS = ['dev', 'test', 'prod'];
const DEV_SOURCES = ['fix/', 'feature/'];
const VERSION_LINE = /^v\d+\//;

export const isVersionLine = (branch) => VERSION_LINE.test(branch);

export const SUCCESS_MESSAGE = 'Branch flow strategy matches team policy.';

export function checkBranchFlow(sourceBranch, targetBranch) {
  const flow = `'${sourceBranch}' → '${targetBranch}'`;

  // Rule 1
  if (isVersionLine(sourceBranch) && PROTECTED_TARGETS.includes(targetBranch)) {
    return {
      success: false,
      message: `Rule 1: version-line branches (v2/*, v3/*, …) can't merge into dev, test or prod (${flow}).`,
    };
  }

  // Rule 2
  if (targetBranch === 'dev' && !DEV_SOURCES.some((prefix) => sourceBranch.startsWith(prefix))) {
    return {
      success: false,
      message: `Rule 2: only fix/* or feature/* branches can merge into dev (${flow}).`,
    };
  }

  // Rule 3
  if (targetBranch === 'test' && sourceBranch !== 'dev') {
    return {
      success: false,
      message: `Rule 3: only the dev branch can merge into test (${flow}).`,
    };
  }

  // Rule 4
  if (targetBranch === 'prod' && sourceBranch !== 'test' && !sourceBranch.startsWith('hotfix/')) {
    return {
      success: false,
      message: `Rule 4: only the test branch or hotfix/* branches can merge into prod (${flow}).`,
    };
  }

  // Rule 5
  if (isVersionLine(targetBranch) && !sourceBranch.startsWith('feature/')) {
    return {
      success: false,
      message: `Rule 5: only feature/* branches can merge into version-line branches (v2/*, v3/*, …) (${flow}).`,
    };
  }

  return { success: true, message: SUCCESS_MESSAGE };
}
