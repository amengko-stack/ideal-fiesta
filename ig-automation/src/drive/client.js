'use strict';
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const { getGoogleAuth } = require('./auth');
const { withRetry } = require('../utils/retry');

const SUPPORTED_MIMES = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
  'video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/avi',
]);

let _drive = null;

async function getDriveClient() {
  if (_drive) return _drive;
  const auth = await getGoogleAuth();
  _drive = google.drive({ version: 'v3', auth });
  return _drive;
}

async function listFiles(folderId) {
  const drive = await getDriveClient();
  return withRetry(async () => {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      fields: 'files(id,name,mimeType,size)',
      pageSize: 50,
    });
    return (res.data.files || []).filter(f => SUPPORTED_MIMES.has(f.mimeType));
  });
}

async function downloadFile(fileId, destPath) {
  const drive = await getDriveClient();
  return withRetry(async () => {
    const res = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'stream' }
    );
    await new Promise((resolve, reject) => {
      const dest = fs.createWriteStream(destPath);
      res.data.pipe(dest);
      dest.on('finish', resolve);
      dest.on('error', reject);
      res.data.on('error', reject);
    });
  });
}

async function uploadFile(localPath, parentFolderId, fileName) {
  const drive = await getDriveClient();
  const name = fileName || path.basename(localPath);
  const mimeType = guessMime(localPath);
  return withRetry(async () => {
    const res = await drive.files.create({
      requestBody: { name, parents: [parentFolderId] },
      media: { mimeType, body: fs.createReadStream(localPath) },
      fields: 'id,name',
    });
    return res.data;
  });
}

async function moveFile(fileId, fromFolderId, toFolderId) {
  const drive = await getDriveClient();
  return withRetry(async () => {
    await drive.files.update({
      fileId,
      addParents: toFolderId,
      removeParents: fromFolderId,
      fields: 'id',
    });
  });
}

async function createTextFile(content, fileName, parentFolderId) {
  const drive = await getDriveClient();
  const { Readable } = require('stream');
  return withRetry(async () => {
    const res = await drive.files.create({
      requestBody: { name: fileName, parents: [parentFolderId] },
      media: { mimeType: 'text/plain', body: Readable.from([content]) },
      fields: 'id,name',
    });
    return res.data;
  });
}

function guessMime(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.webp': 'image/webp', '.mp4': 'video/mp4', '.mov': 'video/quicktime',
    '.avi': 'video/x-msvideo',
  };
  return map[ext] || 'application/octet-stream';
}

module.exports = { getDriveClient, listFiles, downloadFile, uploadFile, moveFile, createTextFile };
