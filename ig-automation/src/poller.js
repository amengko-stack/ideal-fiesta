'use strict';
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const pLimit = require('p-limit');
const { listFiles, downloadFile, uploadFile, moveFile, createTextFile } = require('./drive/client');
const { getFolderIds } = require('./drive/folders');
const { processImage } = require('./processors/image');
const { processVideo, probeVideo } = require('./processors/video');
const { generateCaption, extractVideoThumbnail } = require('./processors/caption');
const { createJobWorkspace } = require('./utils/tmp');
const logger = require('./utils/logger');

const IMAGE_MIMES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
const VIDEO_MIMES = new Set(['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/avi']);

async function processOneFile(file, folders) {
  const jobId = uuidv4();
  const ws = createJobWorkspace(jobId);
  logger.info('Processing file', { name: file.name, mimeType: file.mimeType, jobId });

  // Atomically claim the file by moving it out of Inbox
  try {
    await moveFile(file.id, folders.inbox, folders.processing);
  } catch (claimErr) {
    if (claimErr.message?.includes('notFound') || claimErr?.code === 404) {
      logger.info('File already claimed, skipping', { fileId: file.id });
      return;
    }
    throw claimErr;
  }

  try {
    const ext = path.extname(file.name) || '.jpg';
    const inputPath = ws.path('input' + ext);
    await downloadFile(file.id, inputPath);

    let processedPath;
    let captionImagePath;

    if (IMAGE_MIMES.has(file.mimeType)) {
      processedPath = ws.path('processed.jpg');
      await processImage(inputPath, processedPath, {
        filter: process.env.DEFAULT_IMAGE_FILTER || 'natural',
      });
      captionImagePath = processedPath;
    } else if (VIDEO_MIMES.has(file.mimeType)) {
      processedPath = ws.path('processed.mp4');
      await processVideo(inputPath, processedPath, { addMusic: true });
      captionImagePath = ws.path('thumb.jpg');
      await extractVideoThumbnail(processedPath, captionImagePath);
    } else {
      throw new Error(`Unsupported MIME type: ${file.mimeType}`);
    }

    // Generate AI caption
    const { fullText } = await generateCaption(captionImagePath);

    // Build output filenames based on original name (sans extension)
    const baseName = path.basename(file.name, path.extname(file.name));
    const processedExt = IMAGE_MIMES.has(file.mimeType) ? '.jpg' : '.mp4';
    const processedName = `${baseName}_ig${processedExt}`;
    const captionName   = `${baseName}_caption.txt`;

    // Upload to Ready folder
    await uploadFile(processedPath, folders.ready, processedName);
    await createTextFile(fullText, captionName, folders.ready);

    // Move original to Archive
    await moveFile(file.id, folders.processing, folders.archive);

    logger.info('Done', { name: file.name, processedName, captionName });
  } catch (err) {
    logger.error('Processing failed', { name: file.name, err: err.message, stack: err.stack });
    try {
      await moveFile(file.id, folders.processing, folders.errors);
      const errLog = `File: ${file.name}\nError: ${err.message}\n\n${err.stack || ''}`;
      await createTextFile(errLog, `${path.basename(file.name, path.extname(file.name))}-error.txt`, folders.errors);
    } catch (moveErr) {
      logger.error('Failed to move to errors folder', { moveErr: moveErr.message });
    }
  } finally {
    await ws.cleanup();
  }
}

async function runOneCycle(folders, limit) {
  const files = await listFiles(folders.inbox);
  if (!files.length) {
    logger.info('Inbox empty, nothing to do');
    return;
  }
  logger.info(`Found ${files.length} file(s) in Inbox`);
  await Promise.all(files.map(f => limit(() => processOneFile(f, folders))));
}

async function startPoller() {
  const folders = getFolderIds();
  const interval = parseInt(process.env.POLL_INTERVAL_MS) || 30000;
  const concurrency = parseInt(process.env.MAX_CONCURRENT_JOBS) || 2;
  const limit = pLimit(concurrency);

  logger.info('Poller started', { interval, concurrency, folders: Object.keys(folders) });

  while (true) {
    try {
      await runOneCycle(folders, limit);
    } catch (err) {
      logger.error('Poll cycle error', { err: err.message });
    }
    await new Promise(r => setTimeout(r, interval));
  }
}

module.exports = { startPoller };
