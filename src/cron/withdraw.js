const cron = require('node-cron');
const { getBalance, withdraw } = require('../payments/cryptobot');
const logger = require('../utils/logger');

function startWithdrawCron(bot) {
  const schedule = process.env.WITHDRAW_CRON || '0 3 * * *';
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

      const result = await withdraw({ asset, amount, address: wallet, network });
      logger.info(`Cron: вывод ${amount} ${asset} → ${wallet}`, result);

      const logChat = process.env.LOG_CHAT_ID;
      if (logChat) {
        await bot.api.sendMessage(logChat, `💸 Авто-вывод ${amount} ${asset} (${network}) → ${wallet}`);
      }
    } catch (e) {
      logger.error('Cron вывод — ошибка:', e?.response?.data || e.message);
      const logChat = process.env.LOG_CHAT_ID;
      if (logChat) {
        try { await bot.api.sendMessage(logChat, `⚠️ Cron вывод не удался: ${e.message}`); } catch {}
      }
    }
  });
}

module.exports = { startWithdrawCron };
