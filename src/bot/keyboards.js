const { InlineKeyboard } = require('grammy');
const { getSetting } = require('../config');

function publicUrl() {
  const u = process.env.PUBLIC_URL;
  return (u && /^https?:\/\//.test(u)) ? u.replace(/\/$/, '') : '';
}

function mainKeyboard() {
  const kb = new InlineKeyboard();
  if (getSetting('enable_card')   === '1') kb.text('💳 Оплатить картой',  'pay_card').row();
  if (getSetting('enable_crypto') === '1') kb.text('🪙 Оплатить криптой', 'pay_crypto').row();
  const base = publicUrl();
  if (base) {
    kb.url('📜 Оферта', `${base}/terms`).url('🔒 Политика', `${base}/privacy`);
  }
  return kb;
}

module.exports = { mainKeyboard, publicUrl };
