const { Bot } = require('grammy');
const { registerHandlers } = require('./handlers');
const logger = require('../utils/logger');

async function startBot() {
  const bot = new Bot(process.env.BOT_TOKEN);
  registerHandlers(bot);
  bot.catch(err => logger.error('Ошибка в боте:', err));

  // Проверяем токен сразу — иначе при невалидном BOT_TOKEN процесс
  // молча продолжит работу без бота.
  await bot.init();
  logger.info(`Bot @${bot.botInfo.username} инициализирован`);

  bot.start({ drop_pending_updates: true }).catch(e =>
    logger.error('Сбой polling:', e?.message)
  );
  return bot;
}

module.exports = { startBot };
