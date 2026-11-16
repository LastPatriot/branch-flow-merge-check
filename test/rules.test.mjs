import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkBranchFlow, SUCCESS_MESSAGE } from '../src/rules.js';

const allowed = [
  ['fix/fee-rounding', 'dev'],
  ['feature/login', 'dev'],               // features for the current version
  ['dev', 'test'],
  ['test', 'prod'],
  ['hotfix/v2.0.1', 'prod'],
  ['feature/new-dashboard', 'v3/main'],
  ['feature/new-dashboard', 'v2/main'],    // any version line
  ['feature/new-dashboard', 'v10/payments'],
  ['feature/login', 'feature/login-base'], // other targets are not restricted
  ['v3/main', 'v3-archive'],              // version line into a non-protected branch
  ['fix/x', 'vendor/sdk'],                // vendor/ is not a version line
];

const blocked = [
  ['v3/main', 'dev', 'Rule 1'],
  ['v3/main', 'test', 'Rule 1'],
  ['v3/main', 'prod', 'Rule 1'],
  ['v2/main', 'dev', 'Rule 1'],
  ['v10/payments', 'test', 'Rule 1'],
  ['hotfix/x', 'dev', 'Rule 2'],
  ['chore/deps', 'dev', 'Rule 2'],
  ['featurex', 'dev', 'Rule 2'],          // needs the feature/ prefix
  ['fix/x', 'test', 'Rule 3'],
  ['feature/x', 'test', 'Rule 3'],
  ['dev', 'prod', 'Rule 4'],
  ['fix/x', 'prod', 'Rule 4'],
  ['hotfix', 'prod', 'Rule 4'],          // needs the hotfix/ prefix
  ['fix/x', 'v3/main', 'Rule 5'],
  ['dev', 'v3/main', 'Rule 5'],
  ['fix/x', 'v2/main', 'Rule 5'],
  ['v2/main', 'v3/main', 'Rule 5'],       // no merging between version lines
];

for (const [source, target] of allowed) {
  test(`allows ${source} → ${target}`, () => {
    assert.deepEqual(checkBranchFlow(source, target), { success: true, message: SUCCESS_MESSAGE });
  });
}

for (const [source, target, rule] of blocked) {
  test(`blocks ${source} → ${target} (${rule})`, () => {
    const result = checkBranchFlow(source, target);
    assert.equal(result.success, false);
    assert.match(result.message, new RegExp(`^${rule}:`));
  });
}

test('vendor/ and video-fix are not version lines', () => {
  assert.equal(checkBranchFlow('vendor/sdk', 'prod').message.includes('Rule 1'), false);
  assert.equal(checkBranchFlow('fix/x', 'video-fix').success, true);
});
