require('dotenv').config();
const { startBot, stopBot } = require('./bot');
const { startServer } = require('./server');
const { initDb } = require('./db');
const { getSetting } = require('./config');
const { startWithdrawCron } = require('./cron/withdraw');
const { startPollCron }     = require('./cron/poll');
const { startCleanupCron }  = require('./cron/cleanup');
const logger = require('./utils/logger');

let app;

function validateEnv() {
  const required = ['PUBLIC_URL', 'ADMIN_LOGIN', 'ADMIN_PASSWORD'];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length) throw new Error(`Не заданы обязательные env: ${missing.join(', ')}`);
  if (!/^https?:\/\//.test(process.env.PUBLIC_URL)) {
    throw new Error('PUBLIC_URL должен начинаться с http:// или https://');
  }
  if (!/^https:\/\//.test(process.env.PUBLIC_URL)) {
    logger.warn('⚠️  PUBLIC_URL не HTTPS — оплаты Platega работать не будут. Это допустимо только для предварительного теста.');
  }
}

async function main() {
  validateEnv();

  initDb();
  logger.info('БД инициализирована');

  app = await startServer();
  logger.info(`HTTP сервер слушает порт ${process.env.PORT || 3000}`);

  const token = getSetting('bot_token');
  if (token) {
    try {
      await startBot(token);
      logger.info('Бот запущен');
    } catch (e) {
      logger.error('Не удалось запустить бота (проверьте токен в админке):', e?.message);
    }
  } else {
    logger.warn('BOT_TOKEN не задан — бот не запущен. Откройте /admin/settings.');
  }

  startWithdrawCron();
  startPollCron();
  startCleanupCron();
  logger.info('Cron активен: withdraw, poll, cleanup');
}

async function shutdown(signal) {
  logger.info(`Получен ${signal}, останавливаемся...`);
  try { await stopBot(); }              catch (e) { logger.error('bot.stop:', e?.message); }
  try { if (app) await app.close(); }   catch (e) { logger.error('app.close:', e?.message); }
  process.exit(0);
}

process.once('SIGINT',  () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

main().catch(e => {
  logger.error('Фатальная ошибка запуска:', e?.message);
  process.exit(1);
});
