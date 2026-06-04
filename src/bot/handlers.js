const { getDb } = require('../db');
const { getSetting } = require('../config');
const { mainKeyboard, infoKeyboard, backToInfoKeyboard } = require('./keyboards');
const { createPlategaInvoice } = require('../payments/platega');
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

async function editOrSend(ctx, text, keyboard) {
  const opts = { parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: keyboard };
  try {
    await ctx.editMessageText(text, opts);
  } catch {
    try { await ctx.reply(text, opts); }
    catch (e) { logger.warn('editOrSend fallback:', e?.message); }
  }
}

function isAdmin(ctx) {
  const admin = String(getSetting('admin_tg_id') || '').trim();
  return admin && String(ctx.from?.id) === admin;
}

function registerHandlers(bot) {
  bot.command('start', async (ctx) => {
    saveUser(ctx);
    const title       = escapeHtml(getSetting('offer_title'));
    const description = escapeHtml(getSetting('offer_description'));
    const priceRub    = escapeHtml(getSetting('price_rub'));
    const priceStars  = escapeHtml(getSetting('price_stars'));
    const image       = getSetting('offer_image_url');

    const lines = [];
    if (getSetting('enable_card')  === '1') lines.push(`💳 Для граждан РФ: ${priceRub} ₽`);
    if (getSetting('enable_stars') === '1') lines.push(`⭐ Telegram Stars: ${priceStars}`);
    const priceBlock = lines.length ? lines.join('\n') + '\n\n' : '';

    const text =
      `<b>${title}</b>\n\n${description}\n\n` +
      priceBlock +
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

  // /paysupport — обязательно по правилам Telegram для платежей в Stars
  bot.command('paysupport', async (ctx) => {
    saveUser(ctx);
    const body = getSetting('doc_support_text') || 'По вопросам оплаты и возврата звёзд напишите в поддержку.';
    await ctx.reply(
      `💬 <b>Поддержка по оплате</b>\n\n${escapeHtml(body)}\n\n` +
      `Возврат Telegram Stars возможен по запросу — напишите в поддержку с указанием даты оплаты.`,
      { parse_mode: 'HTML', disable_web_page_preview: true }
    );
  });

  // /refund — возврат Stars. Режим A: только администратору.
  // Формат: /refund <tg_id> <telegram_payment_charge_id>
  bot.command('refund', async (ctx) => {
    if (!isAdmin(ctx)) {
      return ctx.reply('Команда доступна только администратору.');
    }
    const parts = (ctx.match || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length < 2) {
      return ctx.reply(
        'Использование:\n/refund <tg_id> <charge_id>\n\n' +
        'charge_id — это telegram_payment_charge_id из чека (есть в логах оплаты и в БД payments.external_id для провайдера stars).'
      );
    }
    const [userId, chargeId] = parts;
    try {
      await bot.api.refundStarPayment(Number(userId), chargeId);
      getDb().prepare(`UPDATE payments SET status='refunded' WHERE provider='stars' AND external_id=?`).run(chargeId);
      await ctx.reply(`✅ Возврат выполнен: user ${userId}, charge ${chargeId}.\nДоступ в канал при необходимости отзовите вручную.`);
      logger.info(`Stars refund: user=${userId} charge=${chargeId} by admin=${ctx.from.id}`);
    } catch (e) {
      logger.error('refund error:', e?.message);
      await ctx.reply(`❌ Не удалось вернуть: ${e?.message || 'ошибка'}`);
    }
  });

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
      return ctx.answerCallbackQuery({ text: 'Оплата для граждан РФ временно недоступна', show_alert: true });
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

  // Telegram Stars: счёт отправляется прямо в чат (currency XTR, без provider_token)
  bot.callbackQuery('pay_stars', async (ctx) => {
    if (getSetting('enable_stars') !== '1') {
      return ctx.answerCallbackQuery({ text: 'Оплата Stars временно недоступна', show_alert: true });
    }
    const rl = checkRateLimit(`pay:${ctx.from.id}`, 20000);
    if (!rl.ok) {
      return ctx.answerCallbackQuery({ text: `Подождите ${Math.ceil(rl.remainingMs/1000)}с`, show_alert: true });
    }
    const stars = parseInt(getSetting('price_stars'), 10);
    if (!Number.isFinite(stars) || stars < 1) {
      return ctx.answerCallbackQuery({ text: 'Цена в Stars не настроена', show_alert: true });
    }
    await ctx.answerCallbackQuery();
    try {
      const title = (getSetting('offer_title') || 'Доступ').slice(0, 32);
      const description = (getSetting('offer_description') || 'Доступ к закрытому каналу').slice(0, 255);
      // payload вернётся в successful_payment — кладём tg_id для надёжности
      const payload = `stars_${ctx.from.id}_${Date.now()}`;
      await ctx.replyWithInvoice(
        title,
        description,
        payload,
        'XTR',                       // валюта Telegram Stars
        [{ label: title, amount: stars }] // для XTR amount = кол-во звёзд (без множителя 100)
      );
    } catch (e) {
      logger.error('Stars invoice error:', e?.message);
      await ctx.reply('Не удалось выставить счёт в Stars. Попробуйте позже или /info.');
    }
  });

  // Обязательный ответ на pre_checkout в течение 10 секунд, иначе платёж отменится
  bot.on('pre_checkout_query', async (ctx) => {
    try {
      await ctx.answerPreCheckoutQuery(true);
    } catch (e) {
      logger.warn('pre_checkout answer:', e?.message);
      try { await ctx.answerPreCheckoutQuery(false, { error_message: 'Платёж недоступен, попробуйте позже.' }); } catch {}
    }
  });

  // Успешная оплата Stars → пишем в payments и выдаём доступ
  bot.on('message:successful_payment', async (ctx) => {
    const sp = ctx.message.successful_payment;
    const tgId = ctx.from.id;
    saveUser(ctx);

    // только XTR здесь (Platega идёт через внешний вебхук)
    if (sp.currency !== 'XTR') return;

    const chargeId = sp.telegram_payment_charge_id;
    const stars = sp.total_amount; // в XTR это и есть число звёзд

    try {
      getDb().prepare(`
        INSERT INTO payments (tg_id, provider, external_id, amount, currency, status, paid_at, payload)
        VALUES (?, 'stars', ?, ?, 'XTR', 'paid', datetime('now'), ?)
      `).run(tgId, chargeId, stars, JSON.stringify({
        provider_charge_id: sp.provider_payment_charge_id || null,
        invoice_payload: sp.invoice_payload || null,
        at: new Date().toISOString()
      }));
    } catch (e) {
      logger.error('save stars payment:', e?.message);
    }

    try {
      const inviteLink = await issueAccess(bot, tgId);
      getDb().prepare(`UPDATE payments SET invite_link=? WHERE provider='stars' AND external_id=?`).run(inviteLink, chargeId);

      const successText = (getSetting('success_text') || 'Доступ выдан: {invite_link}')
        .replace('{invite_link}', inviteLink);
      await ctx.reply(successText, { disable_web_page_preview: true });

      const logChat = getSetting('log_chat_id');
      if (logChat) {
        try {
          await bot.api.sendMessage(logChat,
            `✅ Оплата Stars\nUser: ${tgId}\nЗвёзд: ${stars} ⭐\ncharge: <code>${chargeId}</code>`,
            { parse_mode: 'HTML' });
        } catch {}
      }
    } catch (e) {
      logger.error('Stars: сбой выдачи доступа:', e?.message);
      await ctx.reply('Оплата прошла, но не удалось выдать ссылку автоматически. Напишите в поддержку: /info (или /myaccess).');
    }
  });
}

module.exports = { registerHandlers };
