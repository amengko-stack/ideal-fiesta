const functions = require('firebase-functions');
const fetch = require('node-fetch');

exports.api = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }

  const { messages, system, max_tokens } = req.body || {};
  const key = process.env.ANTHROPIC_API_KEY;

  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: 'messages must be a non-empty array' });
    return;
  }

  // Clamp client-supplied max_tokens so a caller can't request oversized (costly) completions.
  const cappedMaxTokens = Math.min(Number(max_tokens) || 4000, 6000);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: cappedMaxTokens,
        system,
        messages
      })
    });

    const data = await response.json();
    console.log('[api] Anthropic response status:', response.status);
    res.status(response.status).json(data);
  } catch (err) {
    console.error('[api] error:', err.message);
    res.status(502).json({ error: err.message });
  }
});
