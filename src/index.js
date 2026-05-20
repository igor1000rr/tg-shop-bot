require('dotenv').config();
const { startBot } = require('./bot');
const { startServer } = require('./server');
const { initDb } = require('./db');
const { startWithdrawCron } = require('./cron/withdraw');
const logger = require('./utils/logger');

async function main() {
  initDb();
  logger.info('БД инициализирована');

  const bot = await startBot();
  logger.info('Бот запущен');

  await startServer(bot);
  logger.info(`HTTP сервер слушает порт ${process.env.PORT || 3000}`);

  startWithdrawCron(bot);
  logger.info('Cron автовывода активен');

  process.once('SIGINT', () => bot.stop());
  process.once('SIGTERM', () => bot.stop());
}

main().catch(e => {
  logger.error('Фатальная ошибка запуска:', e);
  process.exit(1);
});
