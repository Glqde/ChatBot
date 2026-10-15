import * as C from './crypto.js';

const $ = (id) => document.getElementById(id);
let token = localStorage.getItem('token');
let user = JSON.parse(localStorage.getItem('user') || 'null');
let keys = null;      // { privateKey, publicKey } from IndexedDB
let chats = [];       // [{ id, key, title }]
let current = null;   // { id, key, title, messages: [{ role, content }] }

async function api(path, method = 'GET', body) {
  const res = await fetch('/api' + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token) logout();
    throw new Error(data.error || 'Request failed');
  }
  return data;
}

// ---------- auth ----------
const creds = () => ({ email: $('email').value.trim(), password: $('password').value });
const showErr = (e) => ($('err').textContent = e.message || String(e));

async function signup() {
  const pair = await C.generateKeypair();               // keys are made in the browser
  const data = await api('/auth/signup', 'POST', {
    ...creds(), publicKey: await C.exportPublic(pair.publicKey), // only the PUBLIC key is sent
  });
  await C.saveKeys(data.user.id, pair);
  await startSession(data, await C.loadKeys(data.user.id));
}

async function signin() {
  const data = await api('/auth/signin', 'POST', creds());
  const k = await C.loadKeys(data.user.id);
  if (!k) throw new Error('No private key on this device, so chats can\'t be decrypted here.');
  await startSession(data, k);
}

async function startSession(data, k) {
  token = data.token; user = data.user; keys = k;
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
  $('auth').hidden = true; $('app').hidden = false;
  $('password').value = '';
  await loadChats();
  newChat();
}

function logout() {
  token = null; user = null; keys = null; chats = []; current = null;
  localStorage.removeItem('token'); localStorage.removeItem('user');
  $('app').hidden = true; $('auth').hidden = false;
}

// ---------- chats ----------
async function loadChats() {
  const rows = await api('/chats');
  chats = [];
  for (const r of rows) {
    try {
      const key = await C.unwrapChatKey(r.wrappedKey, keys.privateKey);
      chats.push({ id: r.id, key, title: await C.decrypt(key, r.titleEnc, r.titleIv) });
    } catch {
      chats.push({ id: r.id, key: null, title: '[unable to decrypt]' });
    }
  }
  renderChats();
}

function newChat() { current = null; renderChats(); renderMsgs(); }

async function openChat(chat) {
  const rows = await api(`/chats/${chat.id}/messages`);
  const messages = [];
  for (const m of rows) {
    let content;
    try { content = await C.decrypt(chat.key, m.ciphertext, m.iv); }
    catch { content = '[unable to decrypt]'; }
    messages.push({ role: m.role, content });
  }
  current = { ...chat, messages };
  renderChats(); renderMsgs();
}

async function storeMsg(role, content) {
  const { ciphertext, iv } = await C.encrypt(current.key, content);
  await api(`/chats/${current.id}/messages`, 'POST', { role, ciphertext, iv });
}

async function send(text) {
  if (!current) {                                        // first message creates the chat
    const key = await C.newChatKey();
    const title = text.slice(0, 40);
    const t = await C.encrypt(key, title);
    const r = await api('/chats', 'POST', {
      wrappedKey: await C.wrapChatKey(key, keys.publicKey),
      titleEnc: t.ciphertext, titleIv: t.iv,
    });
    current = { id: r.id, key, title, messages: [] };
    chats.unshift({ id: r.id, key, title });
  }
  current.messages.push({ role: 'user', content: text });
  renderChats(); renderMsgs();
  await storeMsg('user', text);

  const history = current.messages.slice(-20).map((m) => ({
    role: m.role === 'ai' ? 'assistant' : 'user', content: m.content,
  }));
  const { reply } = await api('/ai/generate', 'POST', { messages: history });
  current.messages.push({ role: 'ai', content: reply });
  renderMsgs();
  await storeMsg('ai', reply);
}

// ---------- rendering (textContent only, so AI output can't inject HTML) ----------
function renderChats() {
  const ul = $('chats'); ul.textContent = '';
  for (const c of chats) {
    const li = document.createElement('li');
    li.textContent = c.title;
    if (current && current.id === c.id) li.className = 'active';
    li.onclick = () => (c.key ? openChat(c) : null);
    ul.appendChild(li);
  }
}

function renderMsgs() {
  const box = $('msgs'); box.textContent = '';
  for (const m of current ? current.messages : []) {
    const d = document.createElement('div');
    d.className = 'msg ' + m.role; d.textContent = m.content;
    box.appendChild(d);
  }
  box.scrollTop = box.scrollHeight;
}

// ---------- wiring ----------
$('signin').onclick = () => signin().catch(showErr);
$('signup').onclick = () => signup().catch(showErr);
$('logout').onclick = logout;
$('new').onclick = newChat;
$('form').onsubmit = async (e) => {
  e.preventDefault();
  const text = $('input').value.trim();
  if (!text) return;
  $('input').value = ''; $('input').disabled = true;
  try { await send(text); }
  catch (err) { alert(err.message); }
  finally { $('input').disabled = false; $('input').focus(); }
};

// resume session on reload
(async () => {
  if (!token || !user) return;
  keys = await C.loadKeys(user.id);
  if (!keys) return logout();
  try { $('auth').hidden = true; $('app').hidden = false; await loadChats(); newChat(); }
  catch { logout(); }
})();
