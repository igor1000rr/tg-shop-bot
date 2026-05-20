const basicAuth = require('@fastify/basic-auth');
const { getDb } = require('../db');
const { getAllSettings, setSetting, DEFAULTS } = require('../config');
const { getBalance, withdraw } = require('../payments/cryptobot');
const logger = require('../utils/logger');

async function registerAdmin(app, bot) {
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
      handler: async (_, reply) => reply.render('admin/dashboard.ejs', { stats: computeStats() })
    });

    app.route({
      method: 'GET', url: '/admin/settings',
      onRequest: app.basicAuth,
      handler: async (_, reply) => reply.render('admin/settings.ejs', {
        settings: getAllSettings(),
        keys: Object.keys(DEFAULTS)
      })
    });

    app.route({
      method: 'POST', url: '/admin/settings',
      onRequest: app.basicAuth,
      handler: async (req, reply) => {
        const body = req.body || {};
        for (const k of Object.keys(DEFAULTS)) {
          if (k in body) setSetting(k, String(body[k] ?? ''));
        }
        return reply.redirect('/admin/settings');
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
          const asset   = process.env.WITHDRAW_ASSET   || 'USDT';
          const wallet  = process.env.WITHDRAW_WALLET;
          const network = process.env.WITHDRAW_NETWORK || 'TRC20';
          if (!wallet) throw new Error('WITHDRAW_WALLET не задан в .env');

          const balances = await getBalance();
          const bal = balances.find(b => b.currency_code === asset);
          if (!bal) throw new Error(`Нет баланса по ${asset}`);
          const amount = Number(bal.available);

          const result = await withdraw({ asset, amount, address: wallet, network });
          logger.info('Ручной вывод выполнен:', result);

          const logChat = process.env.LOG_CHAT_ID;
          if (logChat) await bot.api.sendMessage(logChat, `💸 Ручной вывод ${amount} ${asset} (${network}) → ${wallet}`);
          return reply.type('text/html').send(`<h1>Вывод запущен</h1><pre>${JSON.stringify(result, null, 2)}</pre><a href='/admin'>← назад</a>`);
        } catch (e) {
          logger.error('Сбой вывода:', e?.response?.data || e.message);
          return reply.code(500).type('text/html').send(`<h1>Ошибка вывода</h1><pre>${e.message}</pre><a href='/admin'>← назад</a>`);
        }
      }
    });
  });
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
