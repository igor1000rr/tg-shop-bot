// Cron был для CryptoBot (он не умеет автовывод, присылал уведомления в лог-чат).
// С Cryptomus автовывод настраивается в ЛК, никаких крон-уведомлений не нужно.
// Функции оставляю как no-op чтобы не ломать импорты в index.js.
const logger = require('../utils/logger');

function startWithdrawCron() {
  logger.info('Withdraw cron: автовывод у Cryptomus настраивается в ЛК, cron не требуется');
}
function reloadWithdrawCron() {}

module.exports = { startWithdrawCron, reloadWithdrawCron };
