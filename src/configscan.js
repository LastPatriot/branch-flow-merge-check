// Sensitive config file scan. Pure functions: no Forge or network code, so they can be tested directly.
//
// Blocked (real values must come from ConfigMaps/Secrets, never git):
//   .env and every .env.* variant (.env.local, .env.development, .env.test, ...)
//   appsettings.json                                   (.NET base settings)
//   application.properties, application.yml/.yaml      (Spring Boot base settings)
//
// Allowed (placeholders / dummy values only):
//   .env.production, .env.example
//   appsettings.<env>.json                             (e.g. appsettings.Development.json)
//   application-<profile>.properties/.yml/.yaml        (e.g. application-dev.yml)
//
// Matching is on the file name in any folder, case-insensitive.

const ALLOWED_ENV_FILES = ['.env.production', '.env.example'];
const SPRING_BASE_FILES = ['application.properties', 'application.yml', 'application.yaml'];

const baseName = (path) => path.split('/').pop();

// Returns the reason a path is blocked, or null if it's allowed.
export function blockedReason(path) {
  const name = baseName(path).toLowerCase();

  if (name === '.env' || name.startsWith('.env.')) {
    return ALLOWED_ENV_FILES.includes(name) ? null : '.env files (only .env.production and .env.example are allowed)';
  }
  if (name === 'appsettings.json') {
    return 'appsettings.json (use appsettings.<env>.json with placeholders)';
  }
  if (SPRING_BASE_FILES.includes(name)) {
    return 'Spring Boot base config (use application-<profile> files with placeholders)';
  }
  return null;
}

// diffstat: Bitbucket PR diffstat entries ({ status, old: { path }, new: { path } }).
// Files that are only removed are fine: deleting a committed secret file is the fix.
export function findBlockedFiles(diffstat) {
  const blocked = [];
  for (const entry of diffstat) {
    if (entry.status === 'removed') continue;
    const path = entry.new?.path;
    if (!path) continue;
    const reason = blockedReason(path);
    if (reason) blocked.push({ path, reason });
  }
  return blocked;
}

export const CONFIG_SCAN_SUCCESS = 'No sensitive config files in this pull request.';

export function configScanResult(diffstat) {
  const blocked = findBlockedFiles(diffstat);
  if (blocked.length === 0) return { success: true, message: CONFIG_SCAN_SUCCESS };

  const shown = blocked.slice(0, 10).map((b) => `${b.path} (${b.reason})`);
  const more = blocked.length > 10 ? `, and ${blocked.length - 10} more` : '';
  return {
    success: false,
    message: `Sensitive config files must not be committed: ${shown.join('; ')}${more}. Remove them from the PR and keep real values in Kubernetes ConfigMaps/Secrets.`,
  };
}
