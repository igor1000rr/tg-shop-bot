const cron = require('node-cron');
const { getDb } = require('../db');
const { getPlategaStatus } = require('../payments/platega');
const { getInvoiceStatus } = require('../payments/cryptobot');
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
          } else if (row.provider === 'cryptobot') {
            if (!getSetting('cryptobot_token')) continue;
            const inv = await getInvoiceStatus(row.external_id);
            if (inv?.status === 'paid') {
              await markPaidAndIssue({ provider: 'cryptobot', externalId: row.external_id });
            } else if (inv?.status === 'expired') {
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
