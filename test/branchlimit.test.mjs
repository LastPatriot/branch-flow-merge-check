import { test } from 'node:test';
import assert from 'node:assert/strict';
import { branchLimitResult, parseMaxBranches, DEFAULT_MAX_BRANCHES } from '../src/branchlimit.js';

const branches = (n) => ['dev', 'test', 'prod', ...Array.from({ length: n - 3 }, (_, i) => `feature/f${i}`)];

test('allows exactly the limit', () => {
  const r = branchLimitResult(branches(8), { max: 8, sourceBranch: 'feature/f0', closesSourceBranch: false });
  assert.equal(r.success, true);
  assert.match(r.message, /8 of 8/);
});

test('allows under the limit', () => {
  assert.equal(branchLimitResult(branches(5), { max: 8, sourceBranch: 'feature/f0' }).success, true);
});

test('blocks over the limit and says how many to delete', () => {
  const r = branchLimitResult(branches(10), { max: 8, sourceBranch: 'feature/f0', closesSourceBranch: false });
  assert.equal(r.success, false);
  assert.match(r.message, /10 branches, more than the limit of 8/);
  assert.match(r.message, /Delete 2 stale/);
  assert.match(r.message, /dev/);
});

test('does not count a source branch the PR deletes on merge', () => {
  const r = branchLimitResult(branches(9), { max: 8, sourceBranch: 'feature/f0', closesSourceBranch: true });
  assert.equal(r.success, true);
});

test('counts the source branch when the PR keeps it', () => {
  assert.equal(branchLimitResult(branches(9), { max: 8, sourceBranch: 'feature/f0', closesSourceBranch: false }).success, false);
});

test('notes the excluded source branch when still over the limit', () => {
  const r = branchLimitResult(branches(11), { max: 8, sourceBranch: 'feature/f0', closesSourceBranch: true });
  assert.equal(r.success, false);
  assert.match(r.message, /10 branches \(not counting 'feature\/f0'/);
});

test('long branch lists are shortened', () => {
  const r = branchLimitResult(branches(40), { max: 8, sourceBranch: 'x' });
  assert.match(r.message, /and 25 more\.$/);
});

test('parseMaxBranches', () => {
  assert.equal(parseMaxBranches(undefined), DEFAULT_MAX_BRANCHES);
  assert.equal(parseMaxBranches(''), DEFAULT_MAX_BRANCHES);
  assert.equal(parseMaxBranches('abc'), DEFAULT_MAX_BRANCHES);
  assert.equal(parseMaxBranches('0'), DEFAULT_MAX_BRANCHES);
  assert.equal(parseMaxBranches('2.5'), DEFAULT_MAX_BRANCHES);
  assert.equal(parseMaxBranches('12'), 12);
  assert.equal(DEFAULT_MAX_BRANCHES, 8);
});
