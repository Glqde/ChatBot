const express = require('express');
const { randomUUID } = require('crypto');
const db = require('../db');
const { requireAuth, isStr } = require('../middleware');

const router = express.Router();
router.use(requireAuth);

// Ownership check used by every :id route
function ownChat(req, res) {
  const chat = db.prepare('SELECT * FROM chats WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.userId);
  if (!chat) res.status(404).json({ error: 'Chat not found' });
  return chat;
}

// GET /api/chats
router.get('/', (req, res) => {
  const rows = db.prepare(
    `SELECT id, wrapped_key AS wrappedKey, title_enc AS titleEnc, title_iv AS titleIv,
            created_at AS createdAt, updated_at AS updatedAt
     FROM chats WHERE user_id = ? ORDER BY updated_at DESC`
  ).all(req.userId);
  res.json(rows);
});

// POST /api/chats  { wrappedKey, titleEnc, titleIv }
router.post('/', (req, res) => {
  const { wrappedKey, titleEnc, titleIv } = req.body || {};
  if (!isStr(wrappedKey, 2000) || !isStr(titleEnc, 2000) || !isStr(titleIv, 100))
    return res.status(400).json({ error: 'wrappedKey, titleEnc, titleIv required' });

  const id = randomUUID();
  db.prepare('INSERT INTO chats (id, user_id, wrapped_key, title_enc, title_iv) VALUES (?, ?, ?, ?, ?)')
    .run(id, req.userId, wrappedKey, titleEnc, titleIv);
  res.status(201).json({ id, wrappedKey, titleEnc, titleIv });
});

// PUT /api/chats/:id  { titleEnc, titleIv }
router.put('/:id', (req, res) => {
  if (!ownChat(req, res)) return;
  const { titleEnc, titleIv } = req.body || {};
  if (!isStr(titleEnc, 2000) || !isStr(titleIv, 100))
    return res.status(400).json({ error: 'titleEnc, titleIv required' });
  db.prepare('UPDATE chats SET title_enc = ?, title_iv = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(titleEnc, titleIv, req.params.id);
  res.json({ ok: true });
});

// DELETE /api/chats/:id
router.delete('/:id', (req, res) => {
  if (!ownChat(req, res)) return;
  db.prepare('DELETE FROM chats WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// GET /api/chats/:id/messages  -> ciphertext only
router.get('/:id/messages', (req, res) => {
  if (!ownChat(req, res)) return;
  const rows = db.prepare(
    `SELECT id, role, ciphertext, iv, created_at AS createdAt
     FROM messages WHERE chat_id = ? ORDER BY created_at, rowid`
  ).all(req.params.id);
  res.json(rows);
});

// POST /api/chats/:id/messages  { role, ciphertext, iv }
router.post('/:id/messages', (req, res) => {
  if (!ownChat(req, res)) return;
  const { role, ciphertext, iv } = req.body || {};
  if (!['user', 'ai'].includes(role) || !isStr(ciphertext, 200000) || !isStr(iv, 100))
    return res.status(400).json({ error: 'role, ciphertext, iv required' });

  const id = randomUUID();
  db.prepare('INSERT INTO messages (id, chat_id, role, ciphertext, iv) VALUES (?, ?, ?, ?, ?)')
    .run(id, req.params.id, role, ciphertext, iv);
  db.prepare('UPDATE chats SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.params.id);
  res.status(201).json({ id });
});

module.exports = router;
