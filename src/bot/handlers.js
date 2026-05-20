const { getDb } = require('../db');
const { getSetting } = require('../config');
const { mainKeyboard, publicUrl } = require('./keyboards');
const { createPlategaInvoice } = require('../payments/platega');
const { createCryptobotInvoice } = require('../payments/cryptobot');
const { issueAccess } = require('../utils/invite');
const { checkRateLimit } = require('../utils/rateLimit');
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

  bot.command('myaccess', async (ctx) => {
    saveUser(ctx);
    const tgId = ctx.from.id;
    const row = getDb().prepare(`
      SELECT * FROM payments WHERE tg_id=? AND status='paid' ORDER BY id DESC LIMIT 1
    `).get(tgId);
    if (!row) {
      return ctx.reply('У вас нет активных оплат. Используйте /start чтобы оформить покупку.');
    }
    try {
      const link = await issueAccess(bot, tgId);
      getDb().prepare(`UPDATE payments SET invite_link=? WHERE id=?`).run(link, row.id);
      await ctx.reply(
        `Ваша ссылка для входа:\n${link}\n\nСсылка одноразовая, действует 24 часа.`,
        { disable_web_page_preview: true }
      );
    } catch (e) {
      logger.error('myaccess error:', e?.message);
      await ctx.reply('Не удалось получить ссылку. Обратитесь в поддержку: /help');
    }
  });

  bot.command('help', async (ctx) => {
    const email = getSetting('legal_email') || '—';
    const phone = getSetting('legal_phone') || '—';
    await ctx.reply(
      `📞 Поддержка\n\nEmail: ${email}\nТелефон: ${phone}\n\n` +
      `Команды:\n/start — оформить покупку\n/myaccess — получить ссылку доступа повторно\n/help — эта справка`
    );
  });

  bot.callbackQuery('pay_card', async (ctx) => {
    if (getSetting('enable_card') !== '1') {
      return ctx.answerCallbackQuery({ text: 'Оплата картой временно недоступна', show_alert: true });
    }
    const rl = checkRateLimit(`pay:${ctx.from.id}`, 20000);
    if (!rl.ok) {
      return ctx.answerCallbackQuery({ text: `Подождите ${Math.ceil(rl.remainingMs/1000)}с`, show_alert: true });
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
      await ctx.reply(
        `💳 Ссылка для оплаты (действует ~15 минут):\n${url}\n\nПосле оплаты вернитесь в бот — доступ выдастся автоматически. Если не пришёл — /myaccess.`,
        { disable_web_page_preview: true }
      );
    } catch (e) {
      logger.error('Platega invoice error:', e?.response?.data || e?.message);
      await ctx.reply('Не удалось создать счёт. Попробуйте позже или напишите в /help.');
    }
  });

  bot.callbackQuery('pay_crypto', async (ctx) => {
    if (getSetting('enable_crypto') !== '1') {
      return ctx.answerCallbackQuery({ text: 'Оплата криптой временно недоступна', show_alert: true });
    }
    const rl = checkRateLimit(`pay:${ctx.from.id}`, 20000);
    if (!rl.ok) {
      return ctx.answerCallbackQuery({ text: `Подождите ${Math.ceil(rl.remainingMs/1000)}с`, show_alert: true });
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
      await ctx.reply(
        `🪙 Ссылка для оплаты криптой:\n${url}\n\nПосле оплаты вернитесь в бот — доступ выдастся автоматически. Если не пришёл — /myaccess.`,
        { disable_web_page_preview: true }
      );
    } catch (e) {
      logger.error('CryptoBot invoice error:', e?.response?.data || e?.message);
      await ctx.reply('Не удалось создать счёт. Попробуйте позже или /help.');
    }
  });
}

module.exports = { registerHandlers };
