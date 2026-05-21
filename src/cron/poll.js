const cron = require('node-cron');
const { getDb } = require('../db');
const { getPlategaStatus } = require('../payments/platega');
const { getInvoiceStatus: getCryptomusStatus } = require('../payments/cryptomus');
const { markPaidAndIssue } = require('../server/webhooks');
const logger = require('../utils/logger');

let task = null;

/**
 * Проверяем pending-платежи старше 60 секунд на случай если webhook не дошёл.
 */
async function pollPending() {
  const rows = getDb().prepare(`
    SELECT * FROM payments
    WHERE status='pending' AND created_at < datetime('now','-60 seconds')
    ORDER BY id DESC LIMIT 50
  `).all();

  for (const row of rows) {
    try {
      if (row.provider === 'platega') {
        const data = await getPlategaStatus(row.external_id);
        if (data && String(data.status).toUpperCase() === 'CONFIRMED') {
          await markPaidAndIssue({ provider: 'platega', externalId: row.external_id });
        } else if (data && ['CANCELED','EXPIRED'].includes(String(data.status).toUpperCase())) {
          getDb().prepare(`UPDATE payments SET status='failed' WHERE id=?`).run(row.id);
        }
      } else if (row.provider === 'cryptomus') {
        const data = await getCryptomusStatus({ uuid: row.external_id });
        const s = String(data?.status || '').toLowerCase();
        if (s === 'paid' || s === 'paid_over') {
          await markPaidAndIssue({ provider: 'cryptomus', externalId: row.external_id });
        } else if (['fail','cancel','wrong_amount','system_fail'].includes(s)) {
          getDb().prepare(`UPDATE payments SET status='failed' WHERE id=?`).run(row.id);
        }
      }
    } catch (e) {
      logger.warn(`poll ${row.provider}/${row.external_id}:`, e?.message);
    }
  }
}

function startPollCron() {
  if (task) { try { task.stop(); } catch {} }
  task = cron.schedule('*/2 * * * *', () => pollPending().catch(e => logger.error('poll cron:', e?.message)));
  logger.info('Poll cron активен: */2 * * * *');
}

module.exports = { startPollCron, pollPending };
