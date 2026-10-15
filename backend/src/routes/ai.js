const express = require('express');
const { requireAuth } = require('../middleware');

const router = express.Router();
router.use(requireAuth);

// POST /api/ai/generate  { messages: [{role:'user'|'assistant', content}], model? }
//
// The LLM needs plaintext, so this is the one place the server sees message text.
// It arrives over TLS, lives only in memory for this request, is never logged or
// persisted, and the reply goes straight back to the client, which encrypts it
// before storing anything.
router.post('/generate', async (req, res) => {
  const { messages, model } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 50)
    return res.status(400).json({ error: 'messages must be a non-empty array (max 50)' });

  const clean = [];
  for (const m of messages) {
    if (!m || !['user', 'assistant'].includes(m.role) ||
        typeof m.content !== 'string' || m.content.length === 0 || m.content.length > 8000)
      return res.status(400).json({ error: 'Invalid message in history' });
    clean.push({ role: m.role, content: m.content });
  }

  if (!process.env.OPENROUTER_API_KEY)
    return res.status(500).json({ error: 'AI provider not configured' });

  try {
    const upstream = await fetch(process.env.OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      },
      body: JSON.stringify({
        model: typeof model === 'string' && model.length < 100
          ? model : (process.env.DEFAULT_MODEL || 'openai/gpt-3.5-turbo'),
        messages: clean,
      }),
    });

    if (!upstream.ok) {
      console.error('AI upstream status', upstream.status); // status only, never content
      return res.status(502).json({ error: 'AI provider error' });
    }
    const data = await upstream.json();
    const reply = data?.choices?.[0]?.message?.content;
    if (!reply) return res.status(502).json({ error: 'Empty AI response' });
    res.json({ reply });
  } catch (err) {
    console.error('AI request failed:', err.message);
    res.status(502).json({ error: 'AI provider unreachable' });
  }
});

module.exports = router;
