const axios = require('axios');
const crypto = require('crypto');

const BASE_URL = process.env.PLATEGA_API_URL || 'https://app.platega.io';

// Точные имена полей зависят от документации Platega — здесь общая схема.
// При интеграции свериться с актуальной докой merchantа.
async function createPlategaInvoice({ tgId, amountRub, description }) {
  const shopId = process.env.PLATEGA_SHOP_ID;
  const secret = process.env.PLATEGA_SECRET;
  if (!shopId || !secret) throw new Error('PLATEGA_SHOP_ID / PLATEGA_SECRET не заданы');

  const externalId = `tg_${tgId}_${Date.now()}`;
  const payload = {
    paymentMethod: 1,
    id: externalId,
    paymentDetails: { amount: Number(amountRub), currency: 'RUB' },
    description: description || 'Покупка',
    return:    `${process.env.PUBLIC_URL}/return/success?id=${externalId}`,
    failedUrl: `${process.env.PUBLIC_URL}/return/fail?id=${externalId}`,
    payload: String(tgId)
  };

  const { data } = await axios.post(`${BASE_URL}/transaction/process`, payload, {
    headers: {
      'X-MerchantId':  shopId,
      'X-Secret':      secret,
      'Content-Type':  'application/json'
    },
    timeout: 15000
  });

  return { url: data.redirect || data.url, externalId };
}

function verifyPlategaSignature(rawBody, headerSig) {
  const secret = process.env.PLATEGA_SECRET;
  if (!secret || !headerSig) return false;
  const calc = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return calc === headerSig;
}

module.exports = { createPlategaInvoice, verifyPlategaSignature };
