const axios = require('axios');
const { getSetting } = require('../config');

function baseUrl() {
  return process.env.PLATEGA_API_URL || 'https://app.platega.io';
}

function client() {
  const shopId = getSetting('platega_shop_id');
  const secret = getSetting('platega_secret');
  if (!shopId || !secret) throw new Error('Platega: shop_id / secret не заданы в админке');
  return axios.create({
    baseURL: baseUrl(),
    headers: {
      'X-MerchantId':  shopId,
      'X-Secret':      secret,
      'Content-Type':  'application/json'
    },
    timeout: 15000
  });
}

async function createPlategaInvoice({ tgId, amountRub, description }) {
  const base = process.env.PUBLIC_URL;
  if (!base || !/^https:\/\//.test(base)) {
    throw new Error('PUBLIC_URL должен быть HTTPS-адресом (требование Platega)');
  }
  const cleanBase = base.replace(/\/$/, '');
  const body = {
    paymentDetails: { amount: Number(amountRub), currency: 'RUB' },
    description: description || 'Покупка',
    return:    `${cleanBase}/return/success`,
    failedUrl: `${cleanBase}/return/fail`,
    payload:   `tg_${tgId}`
  };
  // Метод оплаты отправляем только если задан валидный положительный код.
  // Пусто / 0 / мусор → поле не шлём вовсе = у Platega выбор всех методов.
  // (Platega отклоняет paymentMethod:0 с ошибкой VAL_0001 «Wrong input parameters».)
  const pm = Number(getSetting('platega_payment_method'));
  if (Number.isInteger(pm) && pm > 0) body.paymentMethod = pm;

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

async function getPlategaStatus(transactionId) {
  const { data } = await client().get(`/transaction/${transactionId}`);
  return data;
}

function verifyPlategaCallback(headers) {
  const m = headers['x-merchantid'];
  const s = headers['x-secret'];
  const shopId = getSetting('platega_shop_id');
  const secret = getSetting('platega_secret');
  return Boolean(m) && Boolean(s) && Boolean(shopId) && Boolean(secret)
    && m === shopId && s === secret;
}

module.exports = { createPlategaInvoice, getPlategaStatus, verifyPlategaCallback };
