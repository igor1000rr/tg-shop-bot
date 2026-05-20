const cron = require('node-cron');
const { getBalance, buildWithdrawNotice } = require('../payments/cryptobot');
const logger = require('../utils/logger');

function startWithdrawCron(bot) {
  const schedule = process.env.WITHDRAW_CRON || '0 3 * * *';
  if (!cron.validate(schedule)) {
    logger.warn(`Cron: невалидный WITHDRAW_CRON "${schedule}", cron выключен`);
    return;
  }
  cron.schedule(schedule, async () => {
    try {
      const wallet = process.env.WITHDRAW_WALLET;
      if (!wallet) return logger.info('Cron: WITHDRAW_WALLET пуст — пропуск');

      const asset     = process.env.WITHDRAW_ASSET    || 'USDT';
      const network   = process.env.WITHDRAW_NETWORK  || 'TRC20';
      const threshold = Number(process.env.WITHDRAW_THRESHOLD_USDT || 0);

      const balances = await getBalance();
      const bal = balances.find(b => b.currency_code === asset);
      if (!bal) return logger.info(`Cron: нет баланса по ${asset}`);
      const amount = Number(bal.available);
      if (amount < threshold) return logger.info(`Cron: баланс ${amount} ${asset} < порога ${threshold}`);

      const text = buildWithdrawNotice({ asset, amount, wallet, network });
      const logChat = process.env.LOG_CHAT_ID;
      if (logChat) {
        await bot.api.sendMessage(logChat, text, { parse_mode: 'HTML' });
      } else {
        logger.warn('Cron: LOG_CHAT_ID не задан, уведомление некуда отправить');
      }
      logger.info(`Cron: уведомление о выводе отправлено (${amount} ${asset})`);
    } catch (e) {
      logger.error('Cron withdraw error:', e?.response?.data || e.message);
      const logChat = process.env.LOG_CHAT_ID;
      if (logChat) {
        try { await bot.api.sendMessage(logChat, `⚠️ Cron ошибка: ${e.message}`); } catch {}
      }
    }
  });
}

module.exports = { startWithdrawCron };
