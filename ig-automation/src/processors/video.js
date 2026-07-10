'use strict';
const ffmpeg = require('../utils/ffmpeg');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const MAX_DURATION = parseInt(process.env.MAX_VIDEO_DURATION_SEC) || 90;
const MUSIC_VOLUME  = parseFloat(process.env.MUSIC_VOLUME) || 0.3;
const MUSIC_DIR     = process.env.MUSIC_DIR || path.join(__dirname, '../../music');
const FONT_PATH     = process.env.FONT_PATH || path.join(__dirname, '../../fonts/Montserrat-Bold.ttf');

// IG target resolutions
const RESOLUTIONS = { '9:16': [1080, 1920], '1:1': [1080, 1080], '4:5': [1080, 1350] };

async function probeVideo(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) return reject(err);
      const vstream = data.streams.find(s => s.codec_type === 'video');
      const astream = data.streams.find(s => s.codec_type === 'audio');
      resolve({
        duration:  parseFloat(data.format.duration) || 0,
        width:     vstream?.width  || 1080,
        height:    vstream?.height || 1920,
        hasAudio:  !!astream,
      });
    });
  });
}

function pickMusicTrack() {
  if (!fs.existsSync(MUSIC_DIR)) return null;
  const tracks = fs.readdirSync(MUSIC_DIR).filter(f => f.endsWith('.mp3'));
  if (!tracks.length) return null;
  return path.join(MUSIC_DIR, tracks[Math.floor(tracks.length * 0.5) % tracks.length]);
}

function selectTargetRatio(width, height) {
  const r = width / height;
  if (r > 1.2) return '9:16';
  if (r < 0.85) return '4:5';
  return '1:1';
}

async function processVideo(inputPath, outputPath, options = {}) {
  const { captionText, addMusic = true } = options;
  const meta = await probeVideo(inputPath);

  const ratio = selectTargetRatio(meta.width, meta.height);
  const [targetW, targetH] = RESOLUTIONS[ratio];
  const clipDuration = Math.min(meta.duration, MAX_DURATION);
  const musicTrack = addMusic ? pickMusicTrack() : null;

  const scaleFilter = `scale=${targetW}:${targetH}:force_original_aspect_ratio=decrease,pad=${targetW}:${targetH}:(ow-iw)/2:(oh-ih)/2:color=black`;
  const videoFilters = [scaleFilter];

  if (captionText && fs.existsSync(FONT_PATH)) {
    const escaped = captionText.replace(/'/g, "\\'").replace(/:/g, '\\:');
    const fontSize = Math.round(targetW * 0.038);
    videoFilters.push(
      `drawtext=fontfile='${FONT_PATH.replace(/'/g, "\\'")}':text='${escaped}':fontsize=${fontSize}:fontcolor=white:shadowcolor=black:shadowx=2:shadowy=2:x=(w-text_w)/2:y=h-th-60:line_spacing=8`
    );
  }

  return new Promise((resolve, reject) => {
    let cmd = ffmpeg(inputPath)
      .setDuration(clipDuration)
      .videoFilters(videoFilters)
      .videoCodec('libx264')
      .addOutputOption('-crf', '23')
      .addOutputOption('-preset', 'fast')
      .addOutputOption('-movflags', '+faststart');

    if (musicTrack && meta.hasAudio) {
      cmd = cmd
        .addInput(musicTrack)
        .addOutputOption('-filter_complex',
          `[0:a]volume=1.0[orig];[1:a]volume=${MUSIC_VOLUME}[music];[orig][music]amix=inputs=2:duration=first[aout]`
        )
        .addOutputOption('-map', '0:v')
        .addOutputOption('-map', '[aout]')
        .audioCodec('aac')
        .addOutputOption('-b:a', '192k');
    } else if (musicTrack && !meta.hasAudio) {
      cmd = cmd
        .addInput(musicTrack)
        .addOutputOption('-filter_complex', `[1:a]volume=${MUSIC_VOLUME}[aout]`)
        .addOutputOption('-map', '0:v')
        .addOutputOption('-map', '[aout]')
        .audioCodec('aac')
        .addOutputOption('-b:a', '192k')
        .addOutputOption('-shortest');
    } else if (meta.hasAudio) {
      cmd = cmd.audioCodec('aac').addOutputOption('-b:a', '192k');
    } else {
      cmd = cmd.addOutputOption('-an');
    }

    cmd
      .output(outputPath)
      .on('end', () => resolve({ duration: clipDuration, resolution: `${targetW}x${targetH}`, ratio }))
      .on('error', reject)
      .run();
  });
}

module.exports = { processVideo, probeVideo, pickMusicTrack };
