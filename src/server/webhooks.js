const { getDb } = require('../db');
const { getSetting } = require('../config');
const { verifyPlategaCallback } = require('../payments/platega');
const { verifyCryptobotSignature } = require('../payments/cryptobot');
const { issueAccess } = require('../utils/invite');
const logger = require('../utils/logger');

async function registerWebhooks(app, bot) {
  // Platega — проверка по заголовкам X-MerchantId + X-Secret
  app.post('/webhook/platega', async (req, reply) => {
    if (!verifyPlategaCallback(req.headers)) {
      logger.warn('Platega callback: неверные креды в заголовках');
      return reply.code(401).send({ error: 'unauthorized' });
    }
    const { id, status, amount, currency, paymentMethod } = req.body || {};
    if (!id || !status) return reply.code(400).send({ error: 'bad payload' });

    // Сохраняем raw callback в payload для дебага
    try {
      getDb().prepare(`UPDATE payments SET payload=? WHERE provider='platega' AND external_id=?`)
        .run(JSON.stringify({ status, amount, currency, paymentMethod, at: new Date().toISOString() }), id);
    } catch (e) {
      logger.warn('Не удалось сохранить callback payload:', e?.message);
    }

    const s = String(status).toUpperCase();
    if (s === 'CONFIRMED') {
      await markPaidAndIssue({ provider: 'platega', externalId: id, bot });
    } else if (s === 'CANCELED') {
      getDb().prepare(`UPDATE payments SET status='failed' WHERE provider='platega' AND external_id=?`).run(id);
    } else if (s === 'CHARGEBACKED') {
      getDb().prepare(`UPDATE payments SET status='refunded' WHERE provider='platega' AND external_id=?`).run(id);
      const logChat = process.env.LOG_CHAT_ID;
      if (logChat) {
        try { await bot.api.sendMessage(logChat, `⚠️ Чарджбэк Platega ${id}: ${amount} ${currency}`); } catch {}
      }
    }
    return reply.send({ ok: true });
  });

  // CryptoBot — HMAC-SHA256 от raw body, secret = SHA256(token)
  app.post('/webhook/cryptobot', async (req, reply) => {
    const sig = req.headers['crypto-pay-api-signature'];
    if (!verifyCryptobotSignature(req.rawBody, sig)) {
      logger.warn('CryptoBot: неверная подпись');
      return reply.code(401).send({ error: 'bad signature' });
    }
    const { update_type, payload } = req.body || {};
    if (update_type === 'invoice_paid') {
      await markPaidAndIssue({ provider: 'cryptobot', externalId: String(payload.invoice_id), bot });
    }
    return reply.send({ ok: true });
  });

  // GET — чтобы клиент мог вручную проверить, что endpoint жив
  app.get('/webhook/platega',   async (_, reply) => reply.code(405).send({ method: 'POST only' }));
  app.get('/webhook/cryptobot', async (_, reply) => reply.code(405).send({ method: 'POST only' }));
}

async function markPaidAndIssue({ provider, externalId, bot }) {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM payments WHERE provider=? AND external_id=?`).get(provider, externalId);
  if (!row) return logger.warn(`Платёж ${provider}/${externalId} не найден`);
  if (row.status === 'paid') return logger.info(`Платёж ${provider}/${externalId} уже оплачен (идемпотентность)`);

  try {
    const inviteLink = await issueAccess(bot, row.tg_id);
    db.prepare(`UPDATE payments SET status='paid', paid_at=datetime('now'), invite_link=? WHERE id=?`).run(inviteLink, row.id);

    const successText = (getSetting('success_text') || 'Доступ выдан: {invite_link}')
      .replace('{invite_link}', inviteLink);
    await bot.api.sendMessage(row.tg_id, successText, { disable_web_page_preview: true });

    const logChat = process.env.LOG_CHAT_ID;
    if (logChat) {
      await bot.api.sendMessage(logChat,
        `✅ Оплата #${row.id}\nПровайдер: ${provider}\nUser: ${row.tg_id}\nСумма: ${row.amount} ${row.currency}`);
    }
  } catch (e) {
    logger.error('Сбой выдачи доступа:', e?.message);
    const logChat = process.env.LOG_CHAT_ID;
    if (logChat) {
      try {
        await bot.api.sendMessage(logChat,
          `⚠️ Сбой выдачи доступа #${row.id} (${provider}/${externalId}) → user ${row.tg_id}\n${e?.message}`);
      } catch {}
    }
  }
}

module.exports = { registerWebhooks, markPaidAndIssue };
