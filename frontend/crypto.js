// All cryptography lives here. Uses the browser's built-in Web Crypto API only.
//   RSA-OAEP 2048  -> wraps/unwraps per-chat keys (private key is NON-extractable)
//   AES-256-GCM    -> encrypts messages + titles (authenticated)

const b64 = (buf) => {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
};
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

const RSA = {
  name: 'RSA-OAEP',
  modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: 'SHA-256',
};

// extractable=false applies to the private key: JS (and XSS) can never read its bytes
export const generateKeypair = () =>
  crypto.subtle.generateKey(RSA, false, ['wrapKey', 'unwrapKey']);

export const exportPublic = async (pub) =>
  JSON.stringify(await crypto.subtle.exportKey('jwk', pub));

export const newChatKey = () =>
  crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);

export const wrapChatKey = async (aesKey, publicKey) =>
  b64(await crypto.subtle.wrapKey('raw', aesKey, publicKey, { name: 'RSA-OAEP' }));

export const unwrapChatKey = (wrapped, privateKey) =>
  crypto.subtle.unwrapKey(
    'raw', unb64(wrapped), privateKey, { name: 'RSA-OAEP' },
    { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']
  );

export async function encrypt(key, text) {
  const iv = crypto.getRandomValues(new Uint8Array(12)); // fresh IV every message
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(text));
  return { ciphertext: b64(ct), iv: b64(iv) };
}

export async function decrypt(key, ciphertext, iv) {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, key, unb64(ciphertext));
  return new TextDecoder().decode(pt);
}

// --- Key storage: IndexedDB can store CryptoKey objects without exposing raw bytes ---
const openDB = () =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open('securechat', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('keys');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

export async function saveKeys(userId, pair) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('keys', 'readwrite');
    tx.objectStore('keys').put({ privateKey: pair.privateKey, publicKey: pair.publicKey }, userId);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadKeys(userId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction('keys').objectStore('keys').get(userId);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}
