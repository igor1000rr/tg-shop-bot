// Очистка: раз в сутки в 4 утра помечаем failed все pending-платежи старше 48ч.
const cron = require('node-cron');
const { getDb } = require('../db');
const logger = require('../utils/logger');

function startCleanupCron() {
  cron.schedule('0 4 * * *', () => {
    try {
      const r = getDb().prepare(`
        UPDATE payments SET status='failed'
        WHERE status='pending' AND created_at < datetime('now', '-48 hours')
      `).run();
      if (r.changes) logger.info(`Cleanup: ${r.changes} старых pending платежей помечены failed`);
    } catch (e) {
      logger.error('Cleanup cron error:', e?.message);
    }
  });
}

module.exports = { startCleanupCron };
