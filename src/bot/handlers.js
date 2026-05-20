const { getDb } = require('../db');
const { getSetting } = require('../config');
const { mainKeyboard, publicUrl } = require('./keyboards');
const { createPlategaInvoice } = require('../payments/platega');
const { createCryptobotInvoice } = require('../payments/cryptobot');
const logger = require('../utils/logger');

function saveUser(ctx) {
  const u = ctx.from;
  if (!u) return;
  getDb().prepare(`
    INSERT INTO users (tg_id, username, first_name) VALUES (?, ?, ?)
    ON CONFLICT(tg_id) DO UPDATE SET username = excluded.username, first_name = excluded.first_name
  `).run(u.id, u.username || null, u.first_name || null);
}

function registerHandlers(bot) {
  bot.command('start', async (ctx) => {
    saveUser(ctx);
    const title       = getSetting('offer_title');
    const description = getSetting('offer_description');
    const priceRub    = getSetting('price_rub');
    const priceUsdt   = getSetting('price_usdt');
    const image       = getSetting('offer_image_url');
    const base        = publicUrl();

    const legalLine = base
      ? `\n\nНажимая «Оплатить», вы соглашаетесь с <a href="${base}/terms">офертой</a> и <a href="${base}/privacy">политикой конфиденциальности</a>.`
      : '';

    const text =
      `<b>${title}</b>\n\n${description}\n\n` +
      `💳 Карта: ${priceRub} ₽\n🪙 Крипто: ${priceUsdt} USDT` +
      legalLine;

    const opts = { parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: mainKeyboard() };
    if (image) {
      await ctx.replyWithPhoto(image, { caption: text, ...opts });
    } else {
      await ctx.reply(text, opts);
    }
  });

  bot.callbackQuery('pay_card', async (ctx) => {
    if (getSetting('enable_card') !== '1') {
      return ctx.answerCallbackQuery({ text: 'Оплата картой временно недоступна', show_alert: true });
    }
    await ctx.answerCallbackQuery();
    try {
      const amountRub = getSetting('price_rub');
      const { url, externalId } = await createPlategaInvoice({
        tgId: ctx.from.id,
        amountRub,
        description: getSetting('offer_title')
      });
      getDb().prepare(`
        INSERT INTO payments (tg_id, provider, external_id, amount, currency, status)
        VALUES (?, 'platega', ?, ?, 'RUB', 'pending')
      `).run(ctx.from.id, externalId, amountRub);
      await ctx.reply(`💳 Ссылка для оплаты картой:\n${url}\n\nПосле оплаты вернитесь в бот — доступ выдастся автоматически.`);
    } catch (e) {
      logger.error('Сбой создания счёта Platega:', e?.response?.data || e.message);
      await ctx.reply('Не удалось создать счёт. Попробуйте позже.');
    }
  });

  bot.callbackQuery('pay_crypto', async (ctx) => {
    if (getSetting('enable_crypto') !== '1') {
      return ctx.answerCallbackQuery({ text: 'Оплата криптой временно недоступна', show_alert: true });
    }
    await ctx.answerCallbackQuery();
    try {
      const amountUsdt = getSetting('price_usdt');
      const { url, externalId } = await createCryptobotInvoice({
        tgId: ctx.from.id,
        amountUsdt,
        description: getSetting('offer_title')
      });
      getDb().prepare(`
        INSERT INTO payments (tg_id, provider, external_id, amount, currency, status)
        VALUES (?, 'cryptobot', ?, ?, 'USDT', 'pending')
      `).run(ctx.from.id, externalId, amountUsdt);
      await ctx.reply(`🪙 Ссылка для оплаты криптой:\n${url}\n\nПосле оплаты вернитесь в бот — доступ выдастся автоматически.`);
    } catch (e) {
      logger.error('Сбой создания счёта CryptoBot:', e?.response?.data || e.message);
      await ctx.reply('Не удалось создать счёт. Попробуйте позже.');
    }
  });
}

module.exports = { registerHandlers };
