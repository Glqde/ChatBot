const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { randomUUID } = require('crypto');
const db = require('../db');
const { requireAuth, isStr } = require('../middleware');

const router = express.Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const sign = (userId) =>
  jwt.sign({ sub: userId }, process.env.JWT_SECRET, { expiresIn: '24h' });

// POST /api/auth/signup  { email, password, publicKey }
router.post('/signup', async (req, res) => {
  const { email, password, publicKey } = req.body || {};
  if (!isStr(email, 255) || !EMAIL_RE.test(email))
    return res.status(400).json({ error: 'Valid email required' });
  if (!isStr(password, 200) || password.length < 8)
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  if (!isStr(publicKey, 4000))
    return res.status(400).json({ error: 'Public key required' });

  const normalized = email.toLowerCase();
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(normalized))
    return res.status(409).json({ error: 'Email already registered' });

  const id = randomUUID();
  const hash = await bcrypt.hash(password, 12);
  db.prepare('INSERT INTO users (id, email, password_hash, public_key) VALUES (?, ?, ?, ?)')
    .run(id, normalized, hash, publicKey);

  res.status(201).json({ token: sign(id), user: { id, email: normalized, publicKey } });
});

// POST /api/auth/signin  { email, password }
router.post('/signin', async (req, res) => {
  const { email, password } = req.body || {};
  if (!isStr(email, 255) || !isStr(password, 200))
    return res.status(400).json({ error: 'Email and password required' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
  // Same error for unknown email / wrong password
  const ok = user && (await bcrypt.compare(password, user.password_hash));
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

  res.json({
    token: sign(user.id),
    user: { id: user.id, email: user.email, publicKey: user.public_key },
  });
});

// DELETE /api/auth/account  (cascades to chats + messages)
router.delete('/account', requireAuth, (req, res) => {
  db.prepare('DELETE FROM users WHERE id = ?').run(req.userId);
  res.json({ ok: true });
});

module.exports = router;
