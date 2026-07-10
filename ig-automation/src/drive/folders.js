'use strict';

const REQUIRED = {
  inbox:      'DRIVE_INBOX_FOLDER_ID',
  processing: 'DRIVE_PROCESSING_FOLDER_ID',
  ready:      'DRIVE_READY_FOLDER_ID',
  archive:    'DRIVE_ARCHIVE_FOLDER_ID',
  errors:     'DRIVE_ERRORS_FOLDER_ID',
};

let _folders = null;

function getFolderIds() {
  if (_folders) return _folders;
  const missing = [];
  const result = {};
  for (const [key, envVar] of Object.entries(REQUIRED)) {
    const val = process.env[envVar];
    if (!val) missing.push(envVar);
    else result[key] = val;
  }
  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  }
  _folders = result;
  return _folders;
}

module.exports = { getFolderIds };
