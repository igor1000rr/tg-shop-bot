const basicAuth = require('@fastify/basic-auth');
const { getDb } = require('../db');
const { getSetting, setSetting, getAllSettings, SETTINGS_META, GROUPS, SECRET_KEYS } = require('../config');
const { getBalance, buildWithdrawNotice } = require('../payments/cryptobot');
const { getBot, getBotStatus, startBot } = require('../bot');
const { reloadWithdrawCron } = require('../cron/withdraw');
const logger = require('../utils/logger');

async function registerAdmin(app) {
  await app.register(basicAuth, {
    validate: async (username, password) => {
      if (username !== process.env.ADMIN_LOGIN || password !== process.env.ADMIN_PASSWORD) {
        throw new Error('Unauthorized');
      }
    },
    authenticate: { realm: 'Admin' }
  });

  app.after(() => {
    app.route({
      method: 'GET', url: '/admin',
      onRequest: app.basicAuth,
      handler: async (_, reply) => reply.render('admin/dashboard.ejs', {
        stats: computeStats(),
        publicUrl: process.env.PUBLIC_URL || '(PUBLIC_URL не задан)',
        botStatus: getBotStatus()
      })
    });

    app.route({
      method: 'GET', url: '/admin/settings',
      onRequest: app.basicAuth,
      handler: async (_, reply) => reply.render('admin/settings.ejs', {
        settings: getAllSettings(),
        meta: SETTINGS_META,
        groups: GROUPS,
        secretKeys: SECRET_KEYS
      })
    });

    app.route({
      method: 'POST', url: '/admin/settings',
      onRequest: app.basicAuth,
      handler: async (req, reply) => {
        const body = req.body || {};
        const changed = new Set();

        for (const m of SETTINGS_META) {
          const newVal = body[m.key];
          const oldVal = getSetting(m.key);

          // Секреты: пустое значение означает «не менять» (иначе нельзя было
          // бы открывать форму без повторного ввода всех паролей).
          if (m.secret && (newVal === undefined || newVal === '')) continue;

          // checkbox: если hidden=0 + checkbox=1, formbody вернёт массив — берём последнее
          let v = Array.isArray(newVal) ? newVal[newVal.length - 1] : newVal;
          if (m.type === 'checkbox') v = (v === '1' || v === 'on' || v === true) ? '1' : '0';
          if (v === undefined) v = '';

          if (String(v) !== String(oldVal ?? '')) {
            setSetting(m.key, String(v));
            changed.add(m.key);
          }
        }

        await applyConfigChanges(changed);

        return reply.redirect('/admin/settings?saved=1');
      }
    });

    app.route({
      method: 'GET', url: '/admin/payments',
      onRequest: app.basicAuth,
      handler: async (_, reply) => {
        const rows = getDb().prepare(`SELECT * FROM payments ORDER BY id DESC LIMIT 200`).all();
        return reply.render('admin/payments.ejs', { rows });
      }
    });

    app.route({
      method: 'POST', url: '/admin/withdraw',
      onRequest: app.basicAuth,
      handler: async (_, reply) => {
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

          return reply.type('text/html; charset=utf-8').send(
            `<h1>Уведомление отправлено</h1>` +
            `<pre>${text.replace(/<[^>]+>/g,'')}</pre>` +
            `<p><a href='/admin'>← назад</a></p>`
          );
        } catch (e) {
          logger.error('Withdraw notify:', e?.response?.data || e.message);
          return reply.code(500).type('text/html; charset=utf-8').send(
            `<h1>Ошибка</h1><pre>${e.message}</pre><p><a href='/admin'>← назад</a></p>`
          );
        }
      }
    });
  });
}

async function applyConfigChanges(changed) {
  if (changed.has('bot_token')) {
    const token = getSetting('bot_token');
    if (token) {
      try {
        await startBot(token);
        logger.info('Бот перезапущен с новым токеном');
      } catch (e) {
        logger.error('Не удалось перезапустить бота:', e?.message);
      }
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
  return { today, week, month, totalUsers: users.c };
}

module.exports = { registerAdmin };
