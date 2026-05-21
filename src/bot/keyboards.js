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
  kb.text('ℹ️ Информация', 'info_menu');
  return kb;
}

function infoKeyboard() {
  const kb = new InlineKeyboard();
  kb.text('📜 Пользовательское соглашение', 'info_terms').row();
  kb.text('🔒 Политика конфиденциальности', 'info_privacy').row();
  const supportUrl = getSetting('doc_support_url');
  if (supportUrl && /^https?:\/\//.test(supportUrl)) {
    kb.url('💬 Написать в поддержку', supportUrl).row();
  } else {
    kb.text('💬 Поддержка', 'info_support').row();
  }
  kb.text('« Назад', 'info_back');
  return kb;
}

function backToInfoKeyboard() {
  return new InlineKeyboard().text('« Назад', 'info_menu');
}

module.exports = { mainKeyboard, infoKeyboard, backToInfoKeyboard, publicUrl };
