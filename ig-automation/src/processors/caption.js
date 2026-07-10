'use strict';
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const ffmpeg = require('../utils/ffmpeg');
const { withRetry } = require('../utils/retry');
const logger = require('../utils/logger');

const BRAND_CONTEXT = `You are an expert Instagram content creator for a tennis athlete performance training brand.
Content focuses on athlete development, strength & conditioning, match preparation, and peak performance.
Tone: motivational, professional, and inspiring. Target audience: tennis athletes, parents, coaches.`;

async function generateCaption(imagePath, options = {}) {
  const { tone = 'motivational and inspiring', hashtagCount = 25 } = options;

  const imageData = fs.readFileSync(imagePath);
  const base64Image = imageData.toString('base64');

  const prompt = `Analyze this training/sports image and write Instagram content for a tennis performance brand.

Respond ONLY with valid JSON in this exact format (no markdown, no explanation):
{
  "caption": "2-4 sentence caption here",
  "hashtags": ["#hashtag1", "#hashtag2"]
}

Requirements:
- Caption: ${tone} tone, 2-4 sentences, max 150 chars per sentence
- Exactly ${hashtagCount} hashtags: mix of broad (#tennis, #athlete) and niche (#tennislife, #strengthandconditioning, #performancetraining)
- Do not include emojis in hashtags`;

  const requestBody = {
    model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
    max_tokens: parseInt(process.env.ANTHROPIC_MAX_TOKENS) || 1024,
    system: BRAND_CONTEXT,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/jpeg',
              data: base64Image,
            },
          },
          { type: 'text', text: prompt },
        ],
      },
    ],
  };

  const response = await withRetry(() =>
    axios.post('https://api.anthropic.com/v1/messages', requestBody, {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      timeout: 30000,
    }),
    { retries: 3, shouldRetry: (err) => !err.response || err.response.status >= 500 }
  );

  const rawText = response.data?.content?.[0]?.text || '';
  let parsed;
  try {
    // Strip any accidental markdown code fences before parsing
    const clean = rawText.replace(/^```[a-z]*\n?/i, '').replace(/```$/,'').trim();
    parsed = JSON.parse(clean);
  } catch {
    logger.warn('Caption JSON parse failed, using raw text', { rawText: rawText.slice(0, 200) });
    parsed = { caption: rawText.trim(), hashtags: [] };
  }

  const caption = parsed.caption || '';
  const hashtags = Array.isArray(parsed.hashtags) ? parsed.hashtags : [];
  const fullText = `${caption}\n\n${hashtags.join(' ')}`;

  return { caption, hashtags, fullText };
}

async function extractVideoThumbnail(videoPath, outputJpegPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .seekInput(1)
      .frames(1)
      .output(outputJpegPath)
      .on('end', resolve)
      .on('error', reject)
      .run();
  });
}

module.exports = { generateCaption, extractVideoThumbnail };
