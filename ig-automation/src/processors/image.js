'use strict';
const sharp = require('sharp');
const path = require('path');
const { applyFilter } = require('../filters');

// Target IG resolutions: [width, height]
const IG_RATIOS = {
  '1:1': [1080, 1080],
  '4:5': [1080, 1350],
  '9:16': [1080, 1920],
};

function selectIGRatio(width, height) {
  const ratio = width / height;
  if (ratio > 1.2) return '9:16';   // landscape source → vertical Reel
  if (ratio < 0.85) return '4:5';   // portrait source → portrait feed
  return '1:1';                      // square-ish
}

function buildTextSvg(text, width, height, position) {
  const fontSize = Math.round(width * 0.042);
  const padding = Math.round(width * 0.04);
  const lineHeight = fontSize + 10;
  const lines = wrapText(text, 38);
  const blockH = lines.length * lineHeight + padding * 2;

  const yPositions = {
    top:    padding,
    center: Math.round((height - blockH) / 2),
    bottom: height - blockH - padding,
  };
  const yStart = yPositions[position] || yPositions.bottom;

  const rects = `<rect x="0" y="${yStart}" width="${width}" height="${blockH}" fill="rgba(0,0,0,0.45)" rx="6"/>`;
  const texts = lines.map((line, i) =>
    `<text x="${Math.round(width / 2)}" y="${yStart + padding + fontSize + i * lineHeight}"
      font-family="'Montserrat',sans-serif" font-weight="700" font-size="${fontSize}"
      fill="white" text-anchor="middle" dominant-baseline="auto">${escXml(line)}</text>`
  ).join('');

  return Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${rects}${texts}</svg>`
  );
}

function wrapText(text, maxChars) {
  const words = text.split(' ');
  const lines = [];
  let current = '';
  for (const word of words) {
    if ((current + ' ' + word).trim().length <= maxChars) {
      current = (current + ' ' + word).trim();
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function escXml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function processImage(inputPath, outputPath, options = {}) {
  const { filter = process.env.DEFAULT_IMAGE_FILTER || 'natural', overlayText, overlayPosition = 'bottom' } = options;

  const meta = await sharp(inputPath).metadata();
  const ratio = selectIGRatio(meta.width, meta.height);
  const [targetW, targetH] = IG_RATIOS[ratio];

  let pipeline = sharp(inputPath);
  pipeline = applyFilter(pipeline, filter);
  pipeline = pipeline.normalise();

  pipeline = pipeline.resize(targetW, targetH, { fit: 'cover', position: 'centre' });

  if (overlayText && overlayText.trim()) {
    const svg = buildTextSvg(overlayText.trim(), targetW, targetH, overlayPosition);
    pipeline = pipeline.composite([{ input: svg, top: 0, left: 0 }]);
  }

  await pipeline.jpeg({ quality: 92 }).toFile(outputPath);
  return { width: targetW, height: targetH, ratio };
}

module.exports = { processImage, selectIGRatio };
