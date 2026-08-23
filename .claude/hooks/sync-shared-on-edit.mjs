#!/usr/bin/env node
// PostToolUse on Edit/Write: re-run the client/server shared-module sync the
// moment a file under src/lib/ or functions/shared/ changes, so drift is
// fixed immediately instead of waiting to be caught by sharedSync.test.js
// (see scripts/sync-functions-shared.mjs).

import { spawnSync } from 'node:child_process';

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
  const touchesSharedModules =
    /\/src\/lib\//.test(normalized) || /\/functions\/shared\//.test(normalized);
  if (!touchesSharedModules) return;

  const result = spawnSync(process.execPath, ['./scripts/sync-functions-shared.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    console.log(JSON.stringify({
      systemMessage: `sync:shared failed after editing ${filePath}: ${(result.stderr || result.stdout || '').trim()}`,
    }));
  }
});
