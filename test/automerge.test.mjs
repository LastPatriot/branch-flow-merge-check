import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideAutoMerge, targetAllowed } from '../src/automerge.js';

const pr = (overrides = {}) => ({
  state: 'OPEN',
  source: { branch: { name: 'fix/fee-rounding' } },
  destination: { branch: { name: 'dev' } },
  close_source_branch: true,
  participants: [{ role: 'REVIEWER', approved: true, state: 'approved' }],
  ...overrides,
});
const branches = (source, target) => ({ source: { branch: { name: source } }, destination: { branch: { name: target } } });

test('merges an approved, allowed PR and closes a short-lived source branch', () => {
  assert.deepEqual(decideAutoMerge(pr()), { merge: true, closeSourceBranch: true });
});

test('never deletes long-lived source branches (dev → test, test → prod)', () => {
  assert.deepEqual(decideAutoMerge(pr(branches('dev', 'test'))), { merge: true, closeSourceBranch: false });
  assert.deepEqual(decideAutoMerge(pr(branches('test', 'prod'))), { merge: true, closeSourceBranch: false });
});

test('respects the PR author not ticking "close source branch"', () => {
  assert.equal(decideAutoMerge(pr({ close_source_branch: false })).closeSourceBranch, false);
});

test('needs at least one approval; the minimum itself is left to Bitbucket', () => {
  const d = decideAutoMerge(pr({ participants: [{ role: 'REVIEWER', approved: false, state: null }] }));
  assert.equal(d.merge, false);
  assert.match(d.reason, /no approvals/);
  assert.equal(decideAutoMerge(pr({ participants: [] })).merge, false);
  // One approval is enough to ask Bitbucket; Bitbucket refuses until its minimum is met.
  assert.equal(decideAutoMerge(pr()).merge, true);
});

test('does not merge when anyone requested changes', () => {
  const d = decideAutoMerge(pr({ participants: [
    { approved: true, state: 'approved' },
    { approved: false, state: 'changes_requested' },
  ] }));
  assert.equal(d.merge, false);
  assert.match(d.reason, /requested changes/);
});

test('does not merge a PR that breaks the branch flow', () => {
  const d = decideAutoMerge(pr(branches('feature/x', 'dev')));
  assert.equal(d.merge, false);
  assert.match(d.reason, /Rule 2/);
});

test('does not merge closed PRs', () => {
  assert.equal(decideAutoMerge(pr({ state: 'MERGED' })).merge, false);
  assert.equal(decideAutoMerge(pr({ state: 'DECLINED' })).merge, false);
});

test('only merges into configured targets', () => {
  const noProd = 'dev,test,v3/*';
  assert.equal(decideAutoMerge(pr(branches('test', 'prod')), { targets: noProd }).merge, false);
  assert.equal(decideAutoMerge(pr(branches('dev', 'test')), { targets: noProd }).merge, true);
  assert.equal(targetAllowed('v3/main', noProd), true);
  assert.equal(targetAllowed('release/1', undefined), false);
});

test('default targets: dev, test, prod and any version line', () => {
  assert.equal(targetAllowed('dev'), true);
  assert.equal(targetAllowed('prod'), true);
  assert.equal(targetAllowed('v2/main'), true);
  assert.equal(targetAllowed('v10/x'), true);
  assert.equal(targetAllowed('release/1'), false);
  assert.equal(targetAllowed('vendor/x'), false);
  assert.equal(targetAllowed('v2/main', 'dev,v3/*'), false);  // one specific line only
  assert.equal(targetAllowed('v3/main', 'dev,v3/*'), true);
});

test('never deletes a version-line source branch', () => {
  const d = decideAutoMerge(pr({ source: { branch: { name: 'v2/main' } }, destination: { branch: { name: 'v2-archive' } } }), { targets: 'v2-archive' });
  assert.deepEqual(d, { merge: true, closeSourceBranch: false });
});
