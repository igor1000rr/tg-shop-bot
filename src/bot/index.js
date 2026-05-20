const { Bot } = require('grammy');
const { registerHandlers } = require('./handlers');
const logger = require('../utils/logger');

let currentBot = null;
let currentToken = null;

async function startBot(token) {
  if (!token) throw new Error('BOT_TOKEN пуст');

  // Останавливаем предыдущий инстанс если был
  if (currentBot) {
    try { await currentBot.stop(); } catch (e) { logger.warn('Не удалось остановить прошлый бот:', e?.message); }
    currentBot = null;
  }

  const bot = new Bot(token);
  registerHandlers(bot);
  bot.catch(err => logger.error('Ошибка в боте:', err?.message || err));

  await bot.init(); // проверяет токен
  logger.info(`Bot @${bot.botInfo.username} инициализирован`);

  bot.start({ drop_pending_updates: true }).catch(e =>
    logger.error('Сбой polling:', e?.message)
  );

  currentBot = bot;
  currentToken = token;
  return bot;
}

async function stopBot() {
  if (currentBot) {
    try { await currentBot.stop(); } catch (e) { logger.warn('stopBot:', e?.message); }
    currentBot = null;
    currentToken = null;
  }
}

function getBot() { return currentBot; }
function getBotStatus() {
  return {
    running: Boolean(currentBot),
    username: currentBot?.botInfo?.username || null,
    tokenSet: Boolean(currentToken)
  };
}

module.exports = { startBot, stopBot, getBot, getBotStatus };
