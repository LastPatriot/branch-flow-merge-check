import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blockedReason, findBlockedFiles, configScanResult, CONFIG_SCAN_SUCCESS } from '../src/configscan.js';

const blocked = [
  '.env',
  'apps/web/.env',
  '.env.local',
  '.env.development',
  '.env.test',
  '.ENV',                                       // case-insensitive
  'appsettings.json',
  'src/Api/appsettings.json',
  'AppSettings.json',
  'application.properties',
  'src/main/resources/application.yml',
  'src/main/resources/application.yaml',
];

const allowed = [
  '.env.production',
  'frontend/.env.production',
  '.env.example',
  'appsettings.Development.json',
  'src/Api/appsettings.Production.json',
  'src/main/resources/application-dev.yml',
  'src/main/resources/application-prod.properties',
  'src/environment.ts',                         // not a .env file
  'docs/env.md',
  'config/settings.json',
  'application.json',                           // not a Spring Boot config extension
];

for (const path of blocked) {
  test(`blocks ${path}`, () => assert.notEqual(blockedReason(path), null));
}
for (const path of allowed) {
  test(`allows ${path}`, () => assert.equal(blockedReason(path), null));
}

const entry = (status, path, oldPath = path) => ({ status, new: status === 'removed' ? null : { path }, old: { path: oldPath } });

test('deleting a sensitive file is allowed', () => {
  assert.deepEqual(findBlockedFiles([entry('removed', '.env')]), []);
});

test('renaming into a sensitive name is blocked; renaming out of one is allowed', () => {
  assert.equal(findBlockedFiles([entry('renamed', '.env', '.env.sample')]).length, 1);
  assert.equal(findBlockedFiles([entry('renamed', '.env.example', '.env')]).length, 0);
});

test('result passes a clean PR and lists every blocked file otherwise', () => {
  assert.deepEqual(configScanResult([entry('modified', 'src/app.js')]), { success: true, message: CONFIG_SCAN_SUCCESS });
  const r = configScanResult([entry('added', '.env'), entry('modified', 'src/main/resources/application.yml'), entry('modified', 'README.md')]);
  assert.equal(r.success, false);
  assert.match(r.message, /\.env \(/);
  assert.match(r.message, /application\.yml/);
  assert.doesNotMatch(r.message, /README/);
});

test('long lists are capped at 10 files', () => {
  const many = Array.from({ length: 12 }, (_, i) => entry('added', `svc${i}/.env`));
  assert.match(configScanResult(many).message, /and 2 more/);
});
