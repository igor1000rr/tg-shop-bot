const { getDb } = require('../db');
const { getSetting } = require('../config');
const { verifyPlategaSignature } = require('../payments/platega');
const { verifyCryptobotSignature } = require('../payments/cryptobot');
const { issueAccess } = require('../utils/invite');
const logger = require('../utils/logger');

async function registerWebhooks(app, bot) {
  app.post('/webhook/platega', async (req, reply) => {
    const sig = req.headers['x-signature'] || req.headers['x-sign'];
    if (!verifyPlategaSignature(req.rawBody, sig)) {
      logger.warn('Platega: неверная подпись');
      return reply.code(401).send({ error: 'bad signature' });
    }
    const { id, status, payload } = req.body || {};
    const s = String(status || '').toUpperCase();
    if (['CONFIRMED', 'SUCCESS', 'PAID'].includes(s)) {
      await markPaidAndIssue({ provider: 'platega', externalId: id, tgId: Number(payload), bot });
    } else if (['CANCELED', 'FAILED', 'EXPIRED'].includes(s)) {
      getDb().prepare(`UPDATE payments SET status='failed' WHERE provider='platega' AND external_id=?`).run(id);
    }
    return reply.send({ ok: true });
  });

  app.post('/webhook/cryptobot', async (req, reply) => {
    const sig = req.headers['crypto-pay-api-signature'];
    if (!verifyCryptobotSignature(req.rawBody, sig)) {
      logger.warn('CryptoBot: неверная подпись');
      return reply.code(401).send({ error: 'bad signature' });
    }
    const { update_type, payload } = req.body || {};
    if (update_type === 'invoice_paid') {
      await markPaidAndIssue({
        provider:   'cryptobot',
        externalId: String(payload.invoice_id),
        tgId:       Number(payload.payload),
        bot
      });
    }
    return reply.send({ ok: true });
  });
}

async function markPaidAndIssue({ provider, externalId, tgId, bot }) {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM payments WHERE provider=? AND external_id=?`).get(provider, externalId);
  if (!row) return logger.warn(`Платёж ${provider}/${externalId} не найден`);
  if (row.status === 'paid') return logger.info(`Платёж ${provider}/${externalId} уже оплачен`);

  try {
    const inviteLink = await issueAccess(bot, tgId);
    db.prepare(`UPDATE payments SET status='paid', paid_at=datetime('now'), invite_link=? WHERE id=?`).run(inviteLink, row.id);

    const successText = getSetting('success_text').replace('{invite_link}', inviteLink);
    await bot.api.sendMessage(tgId, successText, { disable_web_page_preview: true });

    const logChat = process.env.LOG_CHAT_ID;
    if (logChat) {
      await bot.api.sendMessage(logChat,
        `✅ Оплата #${row.id}\nПровайдер: ${provider}\nUser: ${tgId}\nСумма: ${row.amount} ${row.currency}`);
    }
  } catch (e) {
    logger.error('Сбой выдачи доступа:', e);
  }
}

module.exports = { registerWebhooks };
