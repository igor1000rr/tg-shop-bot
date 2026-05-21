const { getDb } = require('../db');
const { getSetting } = require('../config');
const { verifyPlategaCallback } = require('../payments/platega');
const { verifyWebhook: verifyCryptomus } = require('../payments/cryptomus');
const { issueAccess } = require('../utils/invite');
const { getBot } = require('../bot');
const logger = require('../utils/logger');

async function registerWebhooks(app) {
  // ===== Platega (карты) =====
  app.post('/webhook/platega', async (req, reply) => {
    if (!verifyPlategaCallback(req.headers)) {
      logger.warn('Platega callback: неверные креды');
      return reply.code(401).send({ error: 'unauthorized' });
    }
    const { id, status, amount, currency, paymentMethod } = req.body || {};
    if (!id || !status) return reply.code(400).send({ error: 'bad payload' });

    try {
      getDb().prepare(`UPDATE payments SET payload=? WHERE provider='platega' AND external_id=?`)
        .run(JSON.stringify({ status, amount, currency, paymentMethod, at: new Date().toISOString() }), id);
    } catch (e) { logger.warn('save callback:', e?.message); }

    const s = String(status).toUpperCase();
    if (s === 'CONFIRMED') {
      await markPaidAndIssue({ provider: 'platega', externalId: id });
    } else if (s === 'CANCELED') {
      getDb().prepare(`UPDATE payments SET status='failed' WHERE provider='platega' AND external_id=?`).run(id);
    } else if (s === 'CHARGEBACKED') {
      getDb().prepare(`UPDATE payments SET status='refunded' WHERE provider='platega' AND external_id=?`).run(id);
      await notifyLog(`⚠️ Чарджбэк Platega ${id}: ${amount} ${currency}`);
    }
    return reply.send({ ok: true });
  });

  // ===== Cryptomus (крипта) =====
  app.post('/webhook/cryptomus', async (req, reply) => {
    if (!verifyCryptomus(req.body, 'payment')) {
      logger.warn('Cryptomus: неверная подпись');
      return reply.code(401).send({ error: 'bad signature' });
    }
    const { uuid, order_id, status, amount, currency } = req.body || {};
    const externalId = String(uuid || order_id);
    const s = String(status || '').toLowerCase();

    try {
      getDb().prepare(`UPDATE payments SET payload=? WHERE provider='cryptomus' AND external_id=?`)
        .run(JSON.stringify({ status: s, amount, currency, at: new Date().toISOString() }), externalId);
    } catch (e) { logger.warn('save callback:', e?.message); }

    // Статусы Cryptomus: paid, paid_over (оплачено больше чем нужно), wrong_amount, fail, cancel, refund_paid, system_fail
    if (s === 'paid' || s === 'paid_over') {
      await markPaidAndIssue({ provider: 'cryptomus', externalId });
      // После успешной оплаты — попробуем сразу вывести на внешний кошелёк (если включено)
      setImmediate(() => {
        require('../cron/withdraw').runWithdrawNow().catch(e =>
          logger.warn('post-payment withdraw failed:', e?.message)
        );
      });
    } else if (s === 'fail' || s === 'cancel' || s === 'system_fail' || s === 'wrong_amount') {
      getDb().prepare(`UPDATE payments SET status='failed' WHERE provider='cryptomus' AND external_id=?`).run(externalId);
    } else if (s === 'refund_paid') {
      getDb().prepare(`UPDATE payments SET status='refunded' WHERE provider='cryptomus' AND external_id=?`).run(externalId);
      await notifyLog(`⚠️ Возврат Cryptomus ${externalId}: ${amount} ${currency}`);
    }
    return reply.send({ ok: true });
  });

  // ===== Cryptomus payout webhook =====
  app.post('/webhook/cryptomus-payout', async (req, reply) => {
    if (!verifyCryptomus(req.body, 'payout')) {
      logger.warn('Cryptomus payout: неверная подпись');
      return reply.code(401).send({ error: 'bad signature' });
    }
    const { uuid, status, amount, currency, txid } = req.body || {};
    const s = String(status || '').toLowerCase();
    if (s === 'paid') {
      await notifyLog(`✅ Автовывод выполнен: ${amount} ${currency}\nTx: <code>${txid || '—'}</code>`);
    } else if (s === 'fail' || s === 'system_fail') {
      await notifyLog(`⚠️ Автовывод не удался (${uuid}): ${amount} ${currency}\nСтатус: ${s}`);
    }
    return reply.send({ ok: true });
  });

  app.get('/webhook/platega',         async (_, reply) => reply.code(405).send({ method: 'POST only' }));
  app.get('/webhook/cryptomus',       async (_, reply) => reply.code(405).send({ method: 'POST only' }));
  app.get('/webhook/cryptomus-payout',async (_, reply) => reply.code(405).send({ method: 'POST only' }));
}

async function notifyLog(text) {
  const bot = getBot();
  const chat = getSetting('log_chat_id');
  if (!bot || !chat) return;
  try { await bot.api.sendMessage(chat, text, { parse_mode: 'HTML' }); } catch (e) { logger.warn('notifyLog:', e?.message); }
}

async function markPaidAndIssue({ provider, externalId }) {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM payments WHERE provider=? AND external_id=?`).get(provider, externalId);
  if (!row) return logger.warn(`Платёж ${provider}/${externalId} не найден`);
  if (row.status === 'paid') return logger.info(`Платёж ${provider}/${externalId} уже оплачен`);

  const bot = getBot();
  if (!bot) {
    logger.error(`Платёж ${provider}/${externalId} получен, но бот не запущен — помечаем paid без выдачи`);
    db.prepare(`UPDATE payments SET status='paid', paid_at=datetime('now') WHERE id=?`).run(row.id);
    return;
  }

  try {
    const inviteLink = await issueAccess(bot, row.tg_id);
    db.prepare(`UPDATE payments SET status='paid', paid_at=datetime('now'), invite_link=? WHERE id=?`).run(inviteLink, row.id);

    const successText = (getSetting('success_text') || 'Доступ выдан: {invite_link}')
      .replace('{invite_link}', inviteLink);
    await bot.api.sendMessage(row.tg_id, successText, { disable_web_page_preview: true });

    await notifyLog(`✅ Оплата #${row.id}\nПровайдер: ${provider}\nUser: ${row.tg_id}\nСумма: ${row.amount} ${row.currency}`);
  } catch (e) {
    logger.error('Сбой выдачи доступа:', e?.message);
    await notifyLog(`⚠️ Сбой выдачи #${row.id} (${provider}/${externalId}) → user ${row.tg_id}\n${e?.message}`);
  }
}

module.exports = { registerWebhooks, markPaidAndIssue };
