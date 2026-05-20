require('dotenv').config();
const { startBot } = require('./bot');
const { startServer } = require('./server');
const { initDb } = require('./db');
const { startWithdrawCron } = require('./cron/withdraw');
const logger = require('./utils/logger');

let bot, app;

async function main() {
  if (!process.env.BOT_TOKEN) throw new Error('BOT_TOKEN не задан в .env');

  initDb();
  logger.info('БД инициализирована');

  bot = await startBot();
  logger.info('Бот запущен');

  app = await startServer(bot);
  logger.info(`HTTP сервер слушает порт ${process.env.PORT || 3000}`);

  startWithdrawCron(bot);
  logger.info('Cron автовывода активен');
}

async function shutdown(signal) {
  logger.info(`Получен ${signal}, останавливаемся...`);
  try { if (bot) await bot.stop(); }   catch (e) { logger.error('bot.stop:', e?.message); }
  try { if (app) await app.close(); }  catch (e) { logger.error('app.close:', e?.message); }
  process.exit(0);
}

process.once('SIGINT',  () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

main().catch(e => {
  logger.error('Фатальная ошибка запуска:', e);
  process.exit(1);
});
