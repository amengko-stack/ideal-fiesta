'use strict';
const fs = require('fs');
const path = require('path');

const TMP_ROOT = '/tmp/ig-work';

function createJobWorkspace(jobId) {
  const dir = path.join(TMP_ROOT, jobId);
  fs.mkdirSync(dir, { recursive: true });

  return {
    dir,
    path: (name) => path.join(dir, name),
    cleanup: async () => {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch (_) {
        // best-effort cleanup
      }
    },
  };
}

module.exports = { createJobWorkspace };
