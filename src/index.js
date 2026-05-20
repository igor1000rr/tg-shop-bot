require('dotenv').config();
const { startBot } = require('./bot');
const { startServer } = require('./server');
const { initDb } = require('./db');
const { startWithdrawCron } = require('./cron/withdraw');
const { startPollCron }     = require('./cron/poll');
const { startCleanupCron }  = require('./cron/cleanup');
const logger = require('./utils/logger');

let bot, app;

function validateEnv() {
  const required = ['BOT_TOKEN', 'CHANNEL_ID', 'PUBLIC_URL', 'ADMIN_LOGIN', 'ADMIN_PASSWORD'];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length) {
    throw new Error(`Не заданы обязательные env: ${missing.join(', ')}`);
  }
  if (!/^https:\/\//.test(process.env.PUBLIC_URL)) {
    throw new Error(`PUBLIC_URL должен начинаться с https:// (Platega не принимает HTTP)`);
  }
  if (!process.env.PLATEGA_SHOP_ID && !process.env.CRYPTOBOT_TOKEN) {
    logger.warn('Ни Platega, ни CryptoBot не настроены — платежи не работают');
  }
}

async function main() {
  validateEnv();

  initDb();
  logger.info('БД инициализирована');

  bot = await startBot();

  app = await startServer(bot);
  logger.info(`HTTP сервер слушает порт ${process.env.PORT || 3000}`);

  startWithdrawCron(bot);
  startPollCron(bot);
  startCleanupCron();
  logger.info('Cron активен: withdraw, poll (каждые 2 мин), cleanup (дневной)');
}

async function shutdown(signal) {
  logger.info(`Получен ${signal}, останавливаемся...`);
  try { if (bot) await bot.stop(); }  catch (e) { logger.error('bot.stop:', e?.message); }
  try { if (app) await app.close(); } catch (e) { logger.error('app.close:', e?.message); }
  process.exit(0);
}

process.once('SIGINT',  () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

main().catch(e => {
  logger.error('Фатальная ошибка запуска:', e?.message);
  process.exit(1);
});
