// Раньше здесь был cron для крипто-провайдеров (уведомления/автовывод).
// Теперь приём идёт через Platega (карты) и Telegram Stars — внешний вывод
// настраивается на стороне провайдера/Telegram, периодический cron не нужен.
// Оставляю функции как no-op, чтобы не трогать импорты в index.js.
const logger = require('../utils/logger');

function startWithdrawCron() {
  logger.info('Withdraw cron: не требуется (Platega + Telegram Stars)');
}
function reloadWithdrawCron() {}

module.exports = { startWithdrawCron, reloadWithdrawCron };
