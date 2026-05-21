const axios = require('axios');
const crypto = require('crypto');
const { getSetting } = require('../config');

// Cryptomus Merchant API
// Доки: https://doc.cryptomus.com/business
// Автовывод настраивается в ЛК Cryptomus в разделе Payouts → Auto-Payouts:
// определяешь процент/валюту/адрес и после каждой оплаты Cryptomus сам отправляет средства.
// Мы просто принимаем оплаты и подпись вебхука.

function baseUrl() {
  return process.env.CRYPTOMUS_API_URL || 'https://api.cryptomus.com/v1';
}

function sign(payloadObj, apiKey) {
  const json = JSON.stringify(payloadObj);
  const base64 = Buffer.from(json).toString('base64');
  return crypto.createHash('md5').update(base64 + apiKey).digest('hex');
}

function creds() {
  const merchant = getSetting('cryptomus_merchant');
  const apiKey   = getSetting('cryptomus_api_key');
  if (!merchant || !apiKey) throw new Error('Cryptomus: merchant/api_key не заданы в админке');
  return { merchant, apiKey };
}

async function post(path, payloadObj) {
  const { merchant, apiKey } = creds();
  const signature = sign(payloadObj, apiKey);
  const { data } = await axios.post(baseUrl() + path, payloadObj, {
    headers: {
      'merchant': merchant,
      'sign':     signature,
      'Content-Type': 'application/json'
    },
    timeout: 20000
  });
  return data;
}

// Создаём инвойс. Клиент платит в USDT (либо в любой крипте по курсу), сумма фиксирована в USDT.
async function createCryptomusInvoice({ tgId, amountUsdt, description }) {
  // order_id должен быть уникальным в рамках merchant'а. Кладём tg_id + timestamp + 6 знаков случайных.
  const orderId = `tg${tgId}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const publicUrl = process.env.PUBLIC_URL?.replace(/\/$/, '') || '';
  const data = await post('/payment', {
    amount:      String(amountUsdt),
    currency:    'USDT',
    order_id:    orderId,
    url_callback: publicUrl ? `${publicUrl}/webhook/cryptomus` : undefined,
    url_success:  publicUrl ? `${publicUrl}/return/success` : undefined,
    url_return:   publicUrl ? `${publicUrl}/return/fail` : undefined,
    is_payment_multiple: false,
    lifetime:    1800, // 30 минут
    additional_data: description || ''
  });
  if (data?.state !== 0) throw new Error(`Cryptomus: ${JSON.stringify(data)}`);
  return {
    url:        data.result.url,
    externalId: orderId
  };
}

// Сверка статуса платежа (для poll-cron). По order_id.
async function getCryptomusStatus(orderId) {
  try {
    const data = await post('/payment/info', { order_id: orderId });
    if (data?.state !== 0) return null;
    return data.result; // {payment_status: 'paid' | 'cancel' | 'process' | 'expired' | ...}
  } catch (e) {
    return null;
  }
}

// Проверка подписи вебхука. Cryptomus присылает сигнатуру в самом боди:
//   body.sign = md5(base64(JSON без sign) + apiKey)
function verifyCryptomusSignature(parsedBody) {
  if (!parsedBody || typeof parsedBody !== 'object') return false;
  const incoming = parsedBody.sign;
  if (!incoming) return false;
  const apiKey = getSetting('cryptomus_api_key');
  if (!apiKey) return false;
  const { sign: _omit, ...rest } = parsedBody;
  const base64 = Buffer.from(JSON.stringify(rest)).toString('base64');
  const calc = crypto.createHash('md5').update(base64 + apiKey).digest('hex');
  return calc === incoming;
}

module.exports = {
  createCryptomusInvoice,
  getCryptomusStatus,
  verifyCryptomusSignature
};
