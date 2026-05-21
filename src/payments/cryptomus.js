const axios = require('axios');
const crypto = require('crypto');
const { getSetting } = require('../config');

// API: https://doc.cryptomus.com
function baseUrl() {
  return process.env.CRYPTOMUS_API_URL || 'https://api.cryptomus.com';
}

function sign(body, apiKey) {
  // Подпись Cryptomus: md5( base64( JSON-боди ) + payment_api_key )
  const json = JSON.stringify(body);
  const b64  = Buffer.from(json, 'utf8').toString('base64');
  return crypto.createHash('md5').update(b64 + apiKey).digest('hex');
}

function merchantId() {
  const v = getSetting('cryptomus_merchant_uuid');
  if (!v) throw new Error('Cryptomus: Merchant UUID не задан в админке');
  return v;
}

function paymentApiKey() {
  const v = getSetting('cryptomus_payment_api_key');
  if (!v) throw new Error('Cryptomus: Payment API Key не задан в админке');
  return v;
}

function payoutApiKey() {
  // Отдельный ключ для автовывода. Необязательный: без него просто не работает payout.
  return getSetting('cryptomus_payout_api_key') || null;
}

async function post(path, body, useApiKey) {
  const url = `${baseUrl()}${path}`;
  const signature = sign(body, useApiKey);
  const { data } = await axios.post(url, body, {
    headers: {
      'merchant':     merchantId(),
      'sign':         signature,
      'Content-Type': 'application/json'
    },
    timeout: 15000
  });
  return data;
}

/**
 * Создать инвойс на оплату. Сумма в произвольной валюте (USD/USDT/RUB),
 * клиент выберет крипту на странице оплаты.
 */
async function createCryptomusInvoice({ tgId, amount, currency = 'USD', description }) {
  const orderId  = `tg-${tgId}-${Date.now()}`;
  const callback = (process.env.PUBLIC_URL || '').replace(/\/$/, '');
  const body = {
    amount:       String(amount),
    currency:     String(currency).toUpperCase(),
    order_id:     orderId,
    url_callback: `${callback}/webhook/cryptomus`,
    url_return:   `${callback}/return/success`,
    url_success:  `${callback}/return/success`,
    is_payment_multiple: false,
    lifetime:     3600,
    additional_data: JSON.stringify({ tg_id: tgId, description: description || 'Purchase' })
  };

  const data = await post('/v1/payment', body, paymentApiKey());
  if (data?.state !== 0 || !data?.result?.url) {
    throw new Error(`Cryptomus createInvoice: ${JSON.stringify(data)}`);
  }
  return {
    url:        data.result.url,
    externalId: String(data.result.uuid),
    orderId
  };
}

/**
 * Проверка статуса оплаты по uuid или order_id (poll-fallback).
 */
async function getInvoiceStatus({ uuid, orderId }) {
  const body = uuid ? { uuid } : { order_id: orderId };
  const data = await post('/v1/payment/info', body, paymentApiKey());
  if (data?.state !== 0) return null;
  return data.result;
}

/**
 * Баланс аккаунта в Cryptomus.
 */
async function getBalance() {
  // При пустом body нужен просто {}, не undefined — иначе base64('undefined').
  const data = await post('/v1/balance', {}, paymentApiKey());
  if (data?.state !== 0) throw new Error(`Cryptomus balance: ${JSON.stringify(data)}`);
  // result — это массив { merchant: [...], user: [...] }
  return data.result;
}

/**
 * Создать payout (автовывод на внешний кошелёк). Требует payout API key.
 */
async function createPayout({ amount, currency, network, address, orderId }) {
  const key = payoutApiKey();
  if (!key) throw new Error('Cryptomus: Payout API Key не задан в админке — автовывод невозможен');
  const callback = (process.env.PUBLIC_URL || '').replace(/\/$/, '');
  const body = {
    amount:       String(amount),
    currency:     String(currency).toUpperCase(),
    network:      String(network).toUpperCase(),
    order_id:     orderId || `payout-${Date.now()}`,
    address:      String(address),
    is_subtract:  '1',                  // комиссия вычитается из суммы
    url_callback: `${callback}/webhook/cryptomus-payout`
  };
  const data = await post('/v1/payout', body, key);
  if (data?.state !== 0) throw new Error(`Cryptomus payout: ${JSON.stringify(data)}`);
  return data.result;
}

/**
 * Проверка подписи webhook. Алгоритм: md5( base64(json без поля sign) + api_key ).
 * Для payment-webhook используется payment_api_key, для payout — payout_api_key.
 */
function verifyWebhook(body, kind = 'payment') {
  if (!body || typeof body !== 'object') return false;
  const incoming = body.sign;
  if (!incoming) return false;
  const key = kind === 'payout' ? payoutApiKey() : paymentApiKey();
  if (!key) return false;
  const copy = { ...body };
  delete copy.sign;
  const calc = sign(copy, key);
  // Сравнение в const-time
  try {
    return crypto.timingSafeEqual(Buffer.from(incoming, 'hex'), Buffer.from(calc, 'hex'));
  } catch { return false; }
}

/**
 * Генерация текста уведомления при сбое автовывода или отсутствии payout-ключа.
 */
function buildManualWithdrawNotice({ asset, amount, wallet, network, reason }) {
  return [
    `💸 Накопилось <b>${amount} ${asset}</b> в Cryptomus.`,
    `Адрес: <code>${wallet}</code> (${network})`,
    reason ? `\nПричина: ${reason}` : '',
    ``,
    `Выведи вручную: <a href="https://app.cryptomus.com/payouts">cryptomus.com/payouts</a>`
  ].filter(Boolean).join('\n');
}

module.exports = {
  createCryptomusInvoice,
  getInvoiceStatus,
  getBalance,
  createPayout,
  verifyWebhook,
  buildManualWithdrawNotice
};
