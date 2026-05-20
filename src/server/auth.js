const crypto = require('crypto');

const SESSION_COOKIE = 'tgshop_admin';
const SESSION_TTL_MS = 7 * 24 * 3600 * 1000; // 7 дней

// In-memory хранилище сессий. При перезапуске сервиса юзер выйдет — для
// админки этого достаточно (один инстанс, редкие логины).
const sessions = new Map();

function createSession(user) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { user, expiresAt: Date.now() + SESSION_TTL_MS });
  cleanup();
  return token;
}

function getSession(token) {
  if (!token) return null;
  const s = sessions.get(token);
  if (!s) return null;
  if (s.expiresAt < Date.now()) {
    sessions.delete(token);
    return null;
  }
  return s;
}

function destroySession(token) {
  if (token) sessions.delete(token);
}

function cleanup() {
  if (sessions.size < 100) return;
  const now = Date.now();
  for (const [k, v] of sessions) if (v.expiresAt < now) sessions.delete(k);
}

// Мидлвара для защищённых роутов
async function requireAuth(req, reply) {
  const token = req.cookies?.[SESSION_COOKIE];
  const s = getSession(token);
  if (!s) {
    const from = encodeURIComponent(req.url);
    return reply.redirect(`/admin/login?from=${from}`);
  }
  req.session = s;
}

function setSessionCookie(reply, token) {
  reply.setCookie(SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: false, // Caddy проксирует через HTTPS, но внутренне это HTTP — secure=false окей
    maxAge: Math.floor(SESSION_TTL_MS / 1000)
  });
}

function clearSessionCookie(reply) {
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
}

function verifyCredentials(login, password) {
  return login === process.env.ADMIN_LOGIN && password === process.env.ADMIN_PASSWORD;
}

module.exports = {
  SESSION_COOKIE,
  requireAuth,
  createSession,
  destroySession,
  setSessionCookie,
  clearSessionCookie,
  verifyCredentials
};
