const cron = require('node-cron');
const { getDb } = require('../db');
const { getPlategaStatus } = require('../payments/platega');
const { getCryptomusStatus } = require('../payments/cryptomus');
const { markPaidAndIssue } = require('../server/webhooks');
const { getSetting } = require('../config');
const logger = require('../utils/logger');

function startPollCron() {
  cron.schedule('*/2 * * * *', async () => {
    try {
      const rows = getDb().prepare(`
        SELECT * FROM payments
        WHERE status='pending'
          AND created_at >= datetime('now', '-24 hours')
          AND created_at <= datetime('now', '-1 minutes')
        LIMIT 50
      `).all();

      for (const row of rows) {
        try {
          if (row.provider === 'platega') {
            if (!getSetting('platega_shop_id')) continue;
            const tx = await getPlategaStatus(row.external_id);
            const s = String(tx?.status || '').toUpperCase();
            if (s === 'CONFIRMED') {
              await markPaidAndIssue({ provider: 'platega', externalId: row.external_id });
            } else if (s === 'CANCELED') {
              getDb().prepare(`UPDATE payments SET status='failed' WHERE id=?`).run(row.id);
            }
          } else if (row.provider === 'cryptomus') {
            if (!getSetting('cryptomus_merchant')) continue;
            const inv = await getCryptomusStatus(row.external_id);
            const s = inv?.payment_status;
            if (s === 'paid' || s === 'paid_over') {
              await markPaidAndIssue({ provider: 'cryptomus', externalId: row.external_id });
            } else if (['fail', 'cancel', 'system_fail', 'expired', 'wrong_amount'].includes(s)) {
              getDb().prepare(`UPDATE payments SET status='failed' WHERE id=?`).run(row.id);
            }
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
