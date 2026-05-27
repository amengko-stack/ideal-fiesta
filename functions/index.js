const functions = require('firebase-functions');
const fetch = require('node-fetch');

exports.api = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }

  const { messages, system, max_tokens } = req.body;
  const key = process.env.ANTHROPIC_API_KEY;

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
        max_tokens: max_tokens || 4000,
        system,
        messages
      })
    });

    const data = await response.json();
    console.log('[api] Anthropic response status:', response.status);
    console.log('[api] Anthropic response data:', JSON.stringify(data).slice(0, 500));
    res.json(data);
  } catch (err) {
    console.error('[api] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});
