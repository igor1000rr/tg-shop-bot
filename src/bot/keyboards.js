const { InlineKeyboard } = require('grammy');
const { getSetting } = require('../config');

function mainKeyboard() {
  const kb = new InlineKeyboard();
  if (getSetting('enable_card') === '1') kb.text('💳 Оплатить картой', 'pay_card').row();
  if (getSetting('enable_crypto') === '1') kb.text('🪙 Оплатить криптой', 'pay_crypto').row();
  kb.url('📜 Оферта', `${process.env.PUBLIC_URL}/terms`)
    .url('🔒 Политика', `${process.env.PUBLIC_URL}/privacy`);
  return kb;
}

module.exports = { mainKeyboard };
