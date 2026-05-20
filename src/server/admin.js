const { getDb } = require('../db');
const { getSetting, setSetting, getAllSettings, SETTINGS_META, GROUPS, SECRET_KEYS } = require('../config');
const { getBalance, buildWithdrawNotice } = require('../payments/cryptobot');
const { getBot, getBotStatus, startBot, stopBot } = require('../bot');
const { reloadWithdrawCron } = require('../cron/withdraw');
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

  // Дальше — защищённые роуты
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

  app.post('/admin/withdraw', { preHandler: requireAuth }, async (req, reply) => {
    try {
      const asset   = getSetting('withdraw_asset')   || 'USDT';
      const wallet  = getSetting('withdraw_wallet');
      const network = getSetting('withdraw_network') || 'TRC20';
      if (!wallet) throw new Error('Адрес Trust Wallet не задан в настройках');

      const balances = await getBalance();
      const bal = balances.find(b => b.currency_code === asset);
      if (!bal) throw new Error(`Нет баланса по ${asset}`);
      const amount = Number(bal.available);

      const text = buildWithdrawNotice({ asset, amount, wallet, network });
      const bot = getBot();
      const logChat = getSetting('log_chat_id');
      if (bot && logChat) await bot.api.sendMessage(logChat, text, { parse_mode: 'HTML' });

      return reply.render('admin/withdraw_result.ejs', {
        page: 'dashboard',
        success: true,
        message: text.replace(/<[^>]+>/g, '')
      });
    } catch (e) {
      logger.error('Withdraw notify:', e?.response?.data || e.message);
      return reply.code(500).render('admin/withdraw_result.ejs', {
        page: 'dashboard',
        success: false,
        message: e.message
      });
    }
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
  if (changed.has('withdraw_cron')) {
    try { reloadWithdrawCron(); logger.info('Withdraw cron перезапущен'); }
    catch (e) { logger.error('reload withdraw cron:', e?.message); }
  }
}

function computeStats() {
  const db = getDb();
  const today = db.prepare(`SELECT COUNT(*) c, COALESCE(SUM(CAST(amount AS REAL)),0) s FROM payments WHERE status='paid' AND date(paid_at)=date('now')`).get();
  const week  = db.prepare(`SELECT COUNT(*) c, COALESCE(SUM(CAST(amount AS REAL)),0) s FROM payments WHERE status='paid' AND paid_at >= datetime('now','-7 days')`).get();
  const month = db.prepare(`SELECT COUNT(*) c, COALESCE(SUM(CAST(amount AS REAL)),0) s FROM payments WHERE status='paid' AND paid_at >= datetime('now','-30 days')`).get();
  const users = db.prepare(`SELECT COUNT(*) c FROM users`).get();
  const pending = db.prepare(`SELECT COUNT(*) c FROM payments WHERE status='pending'`).get();
  return { today, week, month, totalUsers: users.c, pending: pending.c };
}

module.exports = { registerAdmin };
