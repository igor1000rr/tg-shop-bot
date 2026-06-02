const cron = require('node-cron');
const { getDb } = require('../db');
const { getPlategaStatus } = require('../payments/platega');
const { markPaidAndIssue } = require('../server/webhooks');
const { getSetting } = require('../config');
const logger = require('../utils/logger');

// Подстраховка на случай потери вебхука Platega: добиваем pending-платежи опросом.
// Telegram Stars сюда не попадают — они оплачиваются синхронно в боте
// (pre_checkout_query → successful_payment), pending-записей не создают.
function startPollCron() {
  cron.schedule('*/2 * * * *', async () => {
    try {
      const rows = getDb().prepare(`
        SELECT * FROM payments
        WHERE status='pending'
          AND provider='platega'
          AND created_at >= datetime('now', '-24 hours')
          AND created_at <= datetime('now', '-1 minutes')
        LIMIT 50
      `).all();

      for (const row of rows) {
        try {
          if (!getSetting('platega_shop_id')) continue;
          const tx = await getPlategaStatus(row.external_id);
          const s = String(tx?.status || '').toUpperCase();
          if (s === 'CONFIRMED') {
            await markPaidAndIssue({ provider: 'platega', externalId: row.external_id });
          } else if (s === 'CANCELED') {
            getDb().prepare(`UPDATE payments SET status='failed' WHERE id=?`).run(row.id);
          }
        } catch (e) {
          logger.warn(`Poll: ${row.provider}/${row.external_id} — ${e?.message}`);
        }
      }
    } catch (e) {
      logger.error('Poll cron error:', e?.message);
    }
  });
}

module.exports = { startPollCron };
