const { getDb } = require('../db');
const { getSetting, setSetting, getAllSettings, SETTINGS_META, GROUPS, SECRET_KEYS } = require('../config');
const { getBot, getBotStatus, startBot, stopBot } = require('../bot');
const {
  requireAuth, createSession, destroySession,
  setSessionCookie, clearSessionCookie, verifyCredentials, SESSION_COOKIE
} = require('./auth');
const logger = require('../utils/logger');

async function registerAdmin(app) {
  // Логин
  app.get('/admin/login', async (req, reply) => {
    return reply.render('admin/login.ejs', {
      from: req.query?.from || '/admin',
      error: null
    });
  });

  app.post('/admin/login', async (req, reply) => {
    const { login, password, from } = req.body || {};
    if (!verifyCredentials(login, password)) {
      return reply.render('admin/login.ejs', {
        from: from || '/admin',
        error: 'Неверный логин или пароль'
      });
    }
    const token = createSession(login);
    setSessionCookie(reply, token);
    const target = (typeof from === 'string' && from.startsWith('/admin')) ? from : '/admin';
    return reply.redirect(target);
  });

  app.get('/admin/logout', async (req, reply) => {
    const token = req.cookies?.[SESSION_COOKIE];
    destroySession(token);
    clearSessionCookie(reply);
    return reply.redirect('/admin/login');
  });

  app.get('/admin', { preHandler: requireAuth }, async (req, reply) => {
    return reply.render('admin/dashboard.ejs', {
      page: 'dashboard',
      stats: computeStats(),
      publicUrl: process.env.PUBLIC_URL || '(PUBLIC_URL не задан)',
      botStatus: getBotStatus()
    });
  });

  app.get('/admin/settings', { preHandler: requireAuth }, async (req, reply) => {
    return reply.render('admin/settings.ejs', {
      page: 'settings',
      settings: getAllSettings(),
      meta: SETTINGS_META,
      groups: GROUPS,
      secretKeys: SECRET_KEYS,
      saved: req.query?.saved === '1',
      activeTab: req.query?.tab || 'bot'
    });
  });

  app.post('/admin/settings', { preHandler: requireAuth }, async (req, reply) => {
    const body = req.body || {};
    const changed = new Set();

    for (const m of SETTINGS_META) {
      const newVal = body[m.key];
      const oldVal = getSetting(m.key);
      if (m.secret && (newVal === undefined || newVal === '')) continue;

      let v = Array.isArray(newVal) ? newVal[newVal.length - 1] : newVal;
      if (m.type === 'checkbox') v = (v === '1' || v === 'on' || v === true) ? '1' : '0';
      if (v === undefined) v = '';

      if (String(v) !== String(oldVal ?? '')) {
        setSetting(m.key, String(v));
        changed.add(m.key);
      }
    }

    await applyConfigChanges(changed);
    const tab = body.__tab || 'bot';
    return reply.redirect(`/admin/settings?saved=1&tab=${tab}`);
  });

  app.get('/admin/payments', { preHandler: requireAuth }, async (req, reply) => {
    const rows = getDb().prepare(`SELECT * FROM payments ORDER BY id DESC LIMIT 200`).all();
    return reply.render('admin/payments.ejs', { page: 'payments', rows });
  });

  app.get('/admin/users', { preHandler: requireAuth }, async (req, reply) => {
    const q = (req.query?.q || '').trim();
    const params = [];
    let where = '';
    if (q) {
      where = `WHERE u.username LIKE ? OR u.first_name LIKE ? OR CAST(u.tg_id AS TEXT) LIKE ?`;
      const like = `%${q}%`;
      params.push(like, like, like);
    }
    const rows = getDb().prepare(`
      SELECT
        u.tg_id,
        u.username,
        u.first_name,
        u.created_at,
        COALESCE(SUM(CASE WHEN p.status='paid'    THEN 1 ELSE 0 END), 0) AS paid_count,
        COALESCE(SUM(CASE WHEN p.status='pending' THEN 1 ELSE 0 END), 0) AS pending_count,
        COALESCE(SUM(CASE WHEN p.status='paid' AND p.currency='RUB' THEN CAST(p.amount AS REAL) ELSE 0 END), 0) AS paid_rub,
        COALESCE(SUM(CASE WHEN p.status='paid' AND p.currency='XTR' THEN CAST(p.amount AS REAL) ELSE 0 END), 0) AS paid_stars,
        MAX(p.paid_at) AS last_paid
      FROM users u
      LEFT JOIN payments p ON p.tg_id = u.tg_id
      ${where}
      GROUP BY u.tg_id
      ORDER BY (CASE WHEN MAX(p.paid_at) IS NULL THEN 1 ELSE 0 END), MAX(p.paid_at) DESC, u.created_at DESC
      LIMIT 300
    `).all(...params);

    const summary = getDb().prepare(`
      SELECT
        (SELECT COUNT(*) FROM users) AS total_users,
        (SELECT COUNT(DISTINCT tg_id) FROM payments WHERE status='paid') AS paying_users,
        (SELECT COUNT(*) FROM users WHERE created_at >= datetime('now','-1 day')) AS new_today
    `).get();

    return reply.render('admin/users.ejs', {
      page: 'users',
      rows,
      summary,
      q
    });
  });
}

async function applyConfigChanges(changed) {
  if (changed.has('bot_token')) {
    const token = getSetting('bot_token');
    if (token) {
      try { await startBot(token); logger.info('Бот перезапущен с новым токеном'); }
      catch (e) { logger.error('Не удалось перезапустить бота:', e?.message); }
    } else {
      try { await stopBot(); logger.info('Бот остановлен (токен очищен)'); } catch {}
    }
  }
}

function computeStats() {
  const db = getDb();
  // Суммы разнесены по валютам: RUB (Platega) и XTR (Telegram Stars),
  // чтобы не складывать рубли со звёздами в одну цифру.
  const sums = (cond) => db.prepare(`
    SELECT
      COUNT(*) AS c,
      COALESCE(SUM(CASE WHEN currency='RUB' THEN CAST(amount AS REAL) ELSE 0 END), 0) AS rub,
      COALESCE(SUM(CASE WHEN currency='XTR' THEN CAST(amount AS REAL) ELSE 0 END), 0) AS stars
    FROM payments WHERE status='paid' AND ${cond}
  `).get();

  const today = sums(`date(paid_at)=date('now')`);
  const week  = sums(`paid_at >= datetime('now','-7 days')`);
  const month = sums(`paid_at >= datetime('now','-30 days')`);
  const users = db.prepare(`SELECT COUNT(*) c FROM users`).get();
  const pending = db.prepare(`SELECT COUNT(*) c FROM payments WHERE status='pending'`).get();
  return { today, week, month, totalUsers: users.c, pending: pending.c };
}

module.exports = { registerAdmin };
