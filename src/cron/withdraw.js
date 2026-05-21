const cron = require('node-cron');
const { getSetting } = require('../config');
const { getBalance, createPayout, buildManualWithdrawNotice } = require('../payments/cryptomus');
const { getBot } = require('../bot');
const logger = require('../utils/logger');

let task = null;

async function notifyLog(text) {
  const bot = getBot();
  const chat = getSetting('log_chat_id');
  if (!bot || !chat) return;
  try { await bot.api.sendMessage(chat, text, { parse_mode: 'HTML' }); }
  catch (e) { logger.warn('notifyLog:', e?.message); }
}

/**
 * Главная логика автовывода. Вызывается по cron и после каждой успешной оплаты.
 */
async function runWithdrawNow() {
  if (getSetting('withdraw_enabled') !== '1') return;

  const asset     = (getSetting('withdraw_asset')   || 'USDT').toUpperCase();
  const network   = (getSetting('withdraw_network') || 'TRON').toUpperCase();
  const wallet    =  getSetting('withdraw_wallet');
  const threshold = parseFloat(getSetting('withdraw_threshold') || '10');

  if (!wallet) {
    logger.warn('runWithdrawNow: адрес кошелька не задан');
    return;
  }

  let balances;
  try {
    balances = await getBalance();
  } catch (e) {
    logger.error('runWithdrawNow getBalance:', e?.response?.data || e?.message);
    return;
  }

  // balance: { merchant: [{ currency_code, balance, ... }], user: [...] }
  const merchantBalances = balances?.[0]?.balance?.merchant || balances?.merchant || [];
  const row = merchantBalances.find(b => String(b.currency_code).toUpperCase() === asset);
  if (!row) {
    logger.info(`runWithdrawNow: нет баланса по ${asset}`);
    return;
  }
  const balance = parseFloat(row.balance || '0');
  if (balance < threshold) {
    logger.info(`runWithdrawNow: баланс ${balance} ${asset} ниже порога ${threshold}`);
    return;
  }

  // Если payout-ключ не задан — идём по fallback: уведомление в лог-чат
  if (!getSetting('cryptomus_payout_api_key')) {
    await notifyLog(buildManualWithdrawNotice({
      asset, amount: balance, wallet, network,
      reason: 'Payout API Key не задан в админке'
    }));
    return;
  }

  try {
    const result = await createPayout({
      amount: balance,
      currency: asset,
      network,
      address: wallet
    });
    logger.info(`Payout создан: ${balance} ${asset} → ${wallet} (uuid: ${result?.uuid})`);
    await notifyLog(`💸 Автовывод в обработке: <b>${balance} ${asset}</b> → <code>${wallet}</code> (${network})\nСтатус придёт в следующем сообщении.`);
  } catch (e) {
    logger.error('createPayout:', e?.response?.data || e?.message);
    await notifyLog(`⚠️ Не удалось создать payout (${balance} ${asset}):\n<code>${escapeForTg(e?.response?.data || e?.message)}</code>`);
  }
}

function escapeForTg(v) {
  const s = (typeof v === 'string') ? v : JSON.stringify(v);
  return String(s).replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]));
}

function startWithdrawCron() {
  const expr = getSetting('withdraw_cron') || '*/30 * * * *';
  if (!cron.validate(expr)) {
    logger.warn(`Withdraw cron: неверный формат "${expr}", не запускаем`);
    return;
  }
  if (task) { try { task.stop(); } catch {} }
  task = cron.schedule(expr, () => runWithdrawNow().catch(e => logger.error('withdraw cron:', e?.message)));
  logger.info(`Withdraw cron активен: ${expr}`);
}

function reloadWithdrawCron() { startWithdrawCron(); }

module.exports = { startWithdrawCron, reloadWithdrawCron, runWithdrawNow };
