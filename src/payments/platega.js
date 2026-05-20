const axios = require('axios');

const BASE_URL = process.env.PLATEGA_API_URL || 'https://app.platega.io';

function client() {
  const shopId = process.env.PLATEGA_SHOP_ID;
  const secret = process.env.PLATEGA_SECRET;
  if (!shopId || !secret) throw new Error('PLATEGA_SHOP_ID / PLATEGA_SECRET не заданы');
  return axios.create({
    baseURL: BASE_URL,
    headers: {
      'X-MerchantId':  shopId,
      'X-Secret':      secret,
      'Content-Type':  'application/json'
    },
    timeout: 15000
  });
}

// POST /transaction/process — создание транзакции.
// ВАЖНО: ID генерируется системой, свой не передаём.
// payload сохраняется в ЛК Platega, но НЕ приходит в callback —
// идентификация выполняется только по transactionId.
async function createPlategaInvoice({ tgId, amountRub, description }) {
  const body = {
    paymentDetails: { amount: Number(amountRub), currency: 'RUB' },
    description: description || 'Покупка',
    return:    `${process.env.PUBLIC_URL}/return/success`,
    failedUrl: `${process.env.PUBLIC_URL}/return/fail`,
    payload: `tg_${tgId}`
  };
  const pm = process.env.PLATEGA_PAYMENT_METHOD;
  if (pm && !Number.isNaN(Number(pm))) body.paymentMethod = Number(pm);

  const { data } = await client().post('/transaction/process', body);
  if (!data?.transactionId || !data?.redirect) {
    throw new Error(`Platega: некорректный ответ ${JSON.stringify(data)}`);
  }
  return {
    url:        data.redirect,
    externalId: data.transactionId,
    expiresIn:  data.expiresIn
  };
}

// GET /transaction/:id — проверка статуса (используется poll-cron'ом).
async function getPlategaStatus(transactionId) {
  const { data } = await client().get(`/transaction/${transactionId}`);
  return data;
}

// Platega НЕ использует HMAC в webhook'ах. В заголовках приходят
// X-MerchantId и X-Secret — сверяем их с нашими.
function verifyPlategaCallback(headers) {
  const m = headers['x-merchantid'];
  const s = headers['x-secret'];
  return Boolean(m) && Boolean(s)
    && m === process.env.PLATEGA_SHOP_ID
    && s === process.env.PLATEGA_SECRET;
}

module.exports = { createPlategaInvoice, getPlategaStatus, verifyPlategaCallback };
