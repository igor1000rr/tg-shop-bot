const { getDb } = require('../db');
const { getSetting } = require('../config');
const { mainKeyboard, infoKeyboard, backToInfoKeyboard } = require('./keyboards');
const { createPlategaInvoice } = require('../payments/platega');
const { createCryptobotInvoice } = require('../payments/cryptobot');
const { issueAccess } = require('../utils/invite');
const { checkRateLimit } = require('../utils/rateLimit');
const { escapeHtml } = require('../utils/html');
const logger = require('../utils/logger');

function saveUser(ctx) {
  const u = ctx.from;
  if (!u) return;
  getDb().prepare(`
    INSERT INTO users (tg_id, username, first_name) VALUES (?, ?, ?)
    ON CONFLICT(tg_id) DO UPDATE SET username = excluded.username, first_name = excluded.first_name
  `).run(u.id, u.username || null, u.first_name || null);
}

// Безопасно ответить или отредактировать сообщение; если было фото (нельзя редактировать в текст) — вышлем новым.
async function editOrSend(ctx, text, keyboard) {
  const opts = { parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: keyboard };
  try {
    await ctx.editMessageText(text, opts);
  } catch {
    try { await ctx.reply(text, opts); }
    catch (e) { logger.warn('editOrSend fallback:', e?.message); }
  }
}

function registerHandlers(bot) {
  bot.command('start', async (ctx) => {
    saveUser(ctx);
    const title       = escapeHtml(getSetting('offer_title'));
    const description = escapeHtml(getSetting('offer_description'));
    const priceRub    = escapeHtml(getSetting('price_rub'));
    const priceUsdt   = escapeHtml(getSetting('price_usdt'));
    const image       = getSetting('offer_image_url');

    const text =
      `<b>${title}</b>\n\n${description}\n\n` +
      `💳 Карта: ${priceRub} ₽\n🪙 Крипто: ${priceUsdt} USDT\n\n` +
      `<i>Нажимая «Оплатить», вы принимаете условия Пользовательского соглашения и Политики конфиденциальности (кнопка «Информация»).</i>`;

    const opts = { parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: mainKeyboard() };
    try {
      if (image) {
        await ctx.replyWithPhoto(image, { caption: text, ...opts });
      } else {
        await ctx.reply(text, opts);
      }
    } catch (e) {
      logger.warn('/start рендер упал, фолбэк:', e?.message);
      await ctx.reply(text.replace(/<[^>]+>/g, ''), { reply_markup: mainKeyboard() });
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
      await ctx.reply('Не удалось получить ссылку. Обратитесь в поддержку: /info');
    }
  });

  // Старый /help и новый /info ведут в одно меню
  const showInfoMenu = async (ctx, asEdit = false) => {
    const text = `ℹ️ <b>Информация</b>\n\nВыберите раздел:`;
    if (asEdit) return editOrSend(ctx, text, infoKeyboard());
    return ctx.reply(text, { parse_mode: 'HTML', reply_markup: infoKeyboard() });
  };

  bot.command('info', async (ctx) => { saveUser(ctx); await showInfoMenu(ctx); });
  bot.command('help', async (ctx) => { saveUser(ctx); await showInfoMenu(ctx); });

  bot.callbackQuery('info_menu', async (ctx) => {
    await ctx.answerCallbackQuery();
    await showInfoMenu(ctx, true);
  });

  bot.callbackQuery('info_back', async (ctx) => {
    await ctx.answerCallbackQuery();
    // Возврат на главный экран: просто закрываем менюшку «Информация»
    try { await ctx.deleteMessage(); } catch {}
    await ctx.reply('Чтобы вернуться к покупке — /start');
  });

  bot.callbackQuery('info_terms', async (ctx) => {
    await ctx.answerCallbackQuery();
    const body = getSetting('doc_terms') || 'Документ пока не заполнен.';
    await editOrSend(ctx, `📜 <b>Пользовательское соглашение</b>\n\n${escapeHtml(body)}`, backToInfoKeyboard());
  });

  bot.callbackQuery('info_privacy', async (ctx) => {
    await ctx.answerCallbackQuery();
    const body = getSetting('doc_privacy') || 'Документ пока не заполнен.';
    await editOrSend(ctx, `🔒 <b>Политика конфиденциальности</b>\n\n${escapeHtml(body)}`, backToInfoKeyboard());
  });

  bot.callbackQuery('info_support', async (ctx) => {
    await ctx.answerCallbackQuery();
    const body = getSetting('doc_support_text') || 'Контакты поддержки пока не заполнены.';
    await editOrSend(ctx, `💬 <b>Поддержка</b>\n\n${escapeHtml(body)}`, backToInfoKeyboard());
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
      await ctx.reply('Не удалось создать счёт. Попробуйте позже или напишите в /info.');
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
      await ctx.reply('Не удалось создать счёт. Попробуйте позже или /info.');
    }
  });
}

module.exports = { registerHandlers };
