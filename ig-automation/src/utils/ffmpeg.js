'use strict';
const ffmpeg = require('fluent-ffmpeg');

// Prefer system ffmpeg/ffprobe (installed in the Docker image); fall back to
// the npm-bundled static binaries for local development.
const fs = require('fs');

function resolveBinary(systemPath, installerPkg) {
  if (fs.existsSync(systemPath)) return systemPath;
  try {
    return require(installerPkg).path;
  } catch {
    return null;
  }
}

const ffmpegBin = resolveBinary('/usr/bin/ffmpeg', '@ffmpeg-installer/ffmpeg');
const ffprobeBin = resolveBinary('/usr/bin/ffprobe', '@ffprobe-installer/ffprobe');

if (ffmpegBin) ffmpeg.setFfmpegPath(ffmpegBin);
if (ffprobeBin) ffmpeg.setFfprobePath(ffprobeBin);

module.exports = ffmpeg;
