import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectChanges, buildReleaseNotes, notesTargetAllowed } from '../src/releasenotes.js';

const c = (message, hash = 'abcdef1234567', name = 'Ada Lovelace') => ({
  hash,
  message,
  author: { raw: `${name} <ada@example.com>`, user: { display_name: name } },
});

const commits = [
  c('Merged in feature/statement-download (pull request #41)\n\nApproved-by: X'),
  c('Merged in fix/fee-rounding (pull request #42)'),
  c('Merged in hotfix/login-timeout (pull request #43)'),
  c('Merged in chore/deps (pull request #44)'),
  c('Merged in dev (pull request #45)'),            // promotion merge: skipped
  c('Merged in v3/main (pull request #46)'),        // version-line merge: skipped
  c('Merged in fix/fee-rounding (pull request #42)'), // duplicate: skipped
  c("Merge branch 'dev' into test"),                // plain merge commit: skipped
  c('Add statement download button', '1234567aaaa'),
  c('Add statement download button', '1234567aaaa'), // duplicate line: skipped
];

test('groups merged PRs by branch type and skips promotion/version-line merges', () => {
  const s = collectChanges(commits);
  assert.deepEqual(s.Features, ['feature/statement-download (#41)']);
  assert.deepEqual(s.Fixes, ['fix/fee-rounding (#42)']);
  assert.deepEqual(s.Hotfixes, ['hotfix/login-timeout (#43)']);
  assert.deepEqual(s['Other pull requests'], ['chore/deps (#44)']);
  assert.deepEqual(s['Other commits'], ['Add statement download button (Ada Lovelace, 1234567)']);
});

test('builds Markdown with a header naming the environment', () => {
  const md = buildReleaseNotes({ id: 50, title: 'Release', source: 'test', target: 'prod', mergeCommit: 'ffffeeeeddddcccc', mergedAt: '2026-11-14T10:00:00Z' }, commits);
  assert.match(md, /^## Release notes: test → prod \(production\)/);
  assert.match(md, /Pull request #50: Release/);
  assert.match(md, /Merge commit: ffffeeeedddd/);
  assert.match(md, /### Features\n- feature\/statement-download \(#41\)/);
  assert.doesNotMatch(md, /Merged in dev/);
  assert.doesNotMatch(md, /[❌✅]/);
});

test('staging header, empty notes and truncation note', () => {
  const empty = [];
  empty.truncated = true;
  const md = buildReleaseNotes({ id: 7, title: 'Promote', source: 'dev', target: 'test' }, empty);
  assert.match(md, /\(staging\)/);
  assert.match(md, /No changes found/);
  assert.match(md, /truncated/);
});

test('release note targets default to test and prod', () => {
  assert.equal(notesTargetAllowed('prod'), true);
  assert.equal(notesTargetAllowed('test'), true);
  assert.equal(notesTargetAllowed('dev'), false);
  assert.equal(notesTargetAllowed('dev', 'dev,prod'), true);
});
