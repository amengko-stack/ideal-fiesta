#!/usr/bin/env node
// PreToolUse guard on Edit/Write: this project has had two prior incidents of
// leaked credentials (Firebase + Anthropic keys, see project history), so
// edits to known secret files are blocked outright instead of relying on
// review to catch it again.

let data = '';
process.stdin.on('data', (chunk) => { data += chunk; });
process.stdin.on('end', () => {
  let input;
  try {
    input = JSON.parse(data);
  } catch {
    return;
  }

  const filePath = input?.tool_input?.file_path;
  if (!filePath) return;

  const normalized = filePath.replace(/\\/g, '/');
  // Anchored on (^|/) so a bare repo-root path is caught: the first version
  // required a leading slash, which let through the exact file that leaked
  // before -- serviceAccountKey.json at the root. Case-insensitive because
  // Windows paths are, and .env also matches .env.local / .env.production,
  // which hold the same secrets.
  const isSecretFile =
    /(^|\/)serviceAccountKey[^/]*\.json$/i.test(normalized) ||
    /(^|\/)\.env(\.[^/]*)?$/i.test(normalized);

  if (isSecretFile) {
    console.log(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason:
          `Blocked: ${filePath} is a secret file (serviceAccountKey*.json or .env). ` +
          'This project has had two prior key-exposure incidents (Firebase + Anthropic). ' +
          'Edit it outside Claude Code if this is intentional.',
      },
    }));
  }
});
