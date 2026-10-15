const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '..', 'securechat.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// The server only ever stores: hashed passwords, PUBLIC keys, wrapped (encrypted)
// chat keys, and ciphertext. No plaintext message, title, or private key.
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  public_key    TEXT NOT NULL,            -- RSA-OAEP public key (JWK JSON)
  created_at    TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS chats (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wrapped_key TEXT NOT NULL,              -- per-chat AES key, encrypted with user's RSA public key
  title_enc   TEXT NOT NULL,              -- AES-GCM ciphertext (base64)
  title_iv    TEXT NOT NULL,
  created_at  TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at  TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS messages (
  id         TEXT PRIMARY KEY,
  chat_id    TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('user','ai')),
  ciphertext TEXT NOT NULL,               -- AES-GCM ciphertext (base64)
  iv         TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_chats_user ON chats(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id, created_at);
`);

module.exports = db;
