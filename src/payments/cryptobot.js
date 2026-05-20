const axios = require('axios');
const crypto = require('crypto');

const BASE_URL = process.env.CRYPTOBOT_API_URL || 'https://pay.crypt.bot/api';

function client() {
  const token = process.env.CRYPTOBOT_TOKEN;
  if (!token) throw new Error('CRYPTOBOT_TOKEN не задан');
  return axios.create({
    baseURL: BASE_URL,
    headers: { 'Crypto-Pay-API-Token': token },
    timeout: 15000
  });
}

async function createCryptobotInvoice({ tgId, amountUsdt, description }) {
  const { data } = await client().post('/createInvoice', {
    currency_type:   'crypto',
    asset:           process.env.WITHDRAW_ASSET || 'USDT',
    amount:          String(amountUsdt),
    description:     description || 'Покупка',
    payload:         String(tgId),
    allow_anonymous: false
  });
  if (!data.ok) throw new Error(`CryptoBot: ${JSON.stringify(data)}`);
  return {
    url:        data.result.bot_invoice_url || data.result.pay_url,
    externalId: String(data.result.invoice_id)
  };
}

async function getInvoiceStatus(invoiceId) {
  const { data } = await client().get('/getInvoices', { params: { invoice_ids: invoiceId } });
  if (!data.ok) return null;
  return data.result?.items?.[0] || null;
}

async function getBalance() {
  const { data } = await client().get('/getBalance');
  if (!data.ok) throw new Error(`CryptoBot getBalance: ${JSON.stringify(data)}`);
  return data.result;
}

function buildWithdrawNotice({ asset, amount, wallet, network }) {
  return [
    `💸 Накопилось <b>${amount} ${asset}</b> в CryptoBot.`,
    `Адрес: <code>${wallet}</code> (${network})`,
    ``,
    `Выведи вручную: @CryptoBot → My Apps → выбери приложение → Withdraw.`
  ].join('\n');
}

function verifyCryptobotSignature(rawBody, signatureHeader) {
  const token = process.env.CRYPTOBOT_TOKEN;
  if (!token || !signatureHeader) return false;
  const secret = crypto.createHash('sha256').update(token).digest();
  const calc = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return calc === signatureHeader;
}

module.exports = {
  createCryptobotInvoice,
  getInvoiceStatus,
  getBalance,
  buildWithdrawNotice,
  verifyCryptobotSignature
};
