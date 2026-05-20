const cron = require('node-cron');
const { getBalance, buildWithdrawNotice } = require('../payments/cryptobot');
const { getSetting } = require('../config');
const { getBot } = require('../bot');
const logger = require('../utils/logger');

let activeTask = null;

function startWithdrawCron() {
  reloadWithdrawCron();
}

function reloadWithdrawCron() {
  if (activeTask) {
    try { activeTask.stop(); } catch {}
    activeTask = null;
  }
  const schedule = getSetting('withdraw_cron') || '0 3 * * *';
  if (!cron.validate(schedule)) {
    logger.warn(`Cron: невалидный withdraw_cron "${schedule}" — пропуск`);
    return;
  }
  activeTask = cron.schedule(schedule, async () => {
    try {
      const wallet = getSetting('withdraw_wallet');
      if (!wallet) return logger.info('Cron: withdraw_wallet не задан — пропуск');
      if (!getSetting('cryptobot_token')) return logger.info('Cron: cryptobot_token пуст — пропуск');

      const asset     = getSetting('withdraw_asset')    || 'USDT';
      const network   = getSetting('withdraw_network')  || 'TRC20';
      const threshold = Number(getSetting('withdraw_threshold') || 0);

      const balances = await getBalance();
      const bal = balances.find(b => b.currency_code === asset);
      if (!bal) return logger.info(`Cron: нет баланса по ${asset}`);
      const amount = Number(bal.available);
      if (amount < threshold) return logger.info(`Cron: ${amount} ${asset} < ${threshold} — пропуск`);

      const text = buildWithdrawNotice({ asset, amount, wallet, network });
      const bot = getBot();
      const logChat = getSetting('log_chat_id');
      if (bot && logChat) {
        await bot.api.sendMessage(logChat, text, { parse_mode: 'HTML' });
      }
      logger.info(`Cron: уведомление о выводе отправлено (${amount} ${asset})`);
    } catch (e) {
      logger.error('Cron withdraw error:', e?.response?.data || e.message);
    }
  });
  logger.info(`Withdraw cron активен: ${schedule}`);
}

module.exports = { startWithdrawCron, reloadWithdrawCron };
