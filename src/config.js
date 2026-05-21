const { getDb } = require('./db');

function getSetting(key, defaultValue = null) {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : defaultValue;
}

function setSetting(key, value) {
  getDb().prepare(`
    INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(key, String(value));
}

function getAllSettings() {
  const rows = getDb().prepare('SELECT key, value FROM settings').all();
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

const SETTINGS_META = [
  // Telegram-бот
  { key: 'bot_token',           group: 'bot',      label: 'BOT_TOKEN',                                                         type: 'password', secret: true,  default: '',
    hint: 'Получить в @BotFather: /newbot → выбрать имя → бот выдаст токен вида 1234:ABCDxxx. Изменение применится сразу — бот перезапустится.' },
  { key: 'channel_id',          group: 'bot',      label: 'ID закрытого канала',                                          type: 'text',     default: '',
    hint: 'Формат: -100xxxxxxxxxx. Способ: в канале «Копировать ссылку на сообщение» → в ссылке t.me/c/XXX/Y взять XXX и добавить спереди -100. Бот должен быть админом канала с правом «Пригласительные ссылки».' },
  { key: 'log_chat_id',         group: 'bot',      label: 'ID чата для логов',                                           type: 'text',     default: '',
    hint: 'Необязательно. Бот будет присылать сюда уведомления об оплатах, ошибках, чарджбэках. Можно указать свой личный ID (получить в @userinfobot).' },

  // Оффер
  { key: 'offer_title',         group: 'offer',    label: 'Заголовок',                                                  type: 'text',     default: 'Доступ к закрытому каналу',
    hint: 'Показывается первым в сообщении при /start в боте.' },
  { key: 'offer_description',   group: 'offer',    label: 'Описание',                                                   type: 'textarea', default: 'Описание продукта. Замените в админке.',
    hint: 'Следует под заголовком.' },
  { key: 'offer_image_url',     group: 'offer',    label: 'URL картинки',                                                type: 'text',     default: '',
    hint: 'Необязательно. Прямая ссылка на jpg/png.' },
  { key: 'price_rub',           group: 'offer',    label: 'Цена в ₽',                                                     type: 'text',     default: '5000' },
  { key: 'price_usdt',          group: 'offer',    label: 'Цена в USDT',                                                  type: 'text',     default: '50' },
  { key: 'enable_card',         group: 'offer',    label: 'Показывать кнопку оплаты картой',                            type: 'checkbox', default: '1' },
  { key: 'enable_crypto',       group: 'offer',    label: 'Показывать кнопку оплаты криптой',                           type: 'checkbox', default: '1' },
  { key: 'success_text',        group: 'offer',    label: 'Сообщение после оплаты',                                       type: 'textarea', default: 'Оплата принята. Ваша ссылка: {invite_link}',
    hint: 'Плейсхолдер {invite_link} будет заменён на реальную ссылку доступа.' },

  // Platega (карты)
  { key: 'platega_shop_id',     group: 'platega',  label: 'Shop ID (Merchant ID)',                                            type: 'password', secret: true, default: '',
    hint: 'UUID, выданный менеджером Platega.' },
  { key: 'platega_secret',      group: 'platega',  label: 'Secret Key (API ключ)',                                          type: 'password', secret: true, default: '' },
  { key: 'platega_payment_method', group: 'platega', label: 'Фиксированный метод оплаты',                                  type: 'text', default: '',
    hint: 'Пусто = выбор всех методов (рекомендуется).' },

  // CryptoBot
  { key: 'cryptobot_token',     group: 'crypto',   label: 'API Token',                                                        type: 'password', secret: true, default: '',
    hint: '@CryptoBot → My Apps → Create App.' },

  // Автовывод
  { key: 'withdraw_wallet',     group: 'withdraw', label: 'Адрес Trust Wallet',                                                type: 'text',     default: '' },
  { key: 'withdraw_network',    group: 'withdraw', label: 'Сеть',                                                            type: 'text',     default: 'TRC20',
    hint: 'TRC20, TON, BEP20, ERC20.' },
  { key: 'withdraw_asset',      group: 'withdraw', label: 'Криптовалюта',                                                    type: 'text',     default: 'USDT' },
  { key: 'withdraw_threshold',  group: 'withdraw', label: 'Порог уведомления',                                              type: 'text',     default: '50' },
  { key: 'withdraw_cron',       group: 'withdraw', label: 'Расписание проверки (cron)',                                    type: 'text', default: '0 3 * * *',
    hint: 'Формат cron. Примеры: 0 3 * * * — в 3:00 каждый день; 0 */6 * * * — каждые 6 часов.' },

  // Документы и поддержка (в боте)
  { key: 'doc_privacy',         group: 'docs',     label: 'Политика конфиденциальности', type: 'textarea', default: '',
    hint: 'Полный текст политики. Показывается в боте при нажатии «Информация». Образец от Platega: https://telegra.ph/Politika-konfidencialnosti-08-15-17' },
  { key: 'doc_terms',           group: 'docs',     label: 'Пользовательское соглашение',     type: 'textarea', default: '',
    hint: 'Полный текст соглашения. Образец от Platega: https://telegra.ph/Polzovatelskoe-soglashenie-08-15-10' },
  { key: 'doc_support_text',    group: 'docs',     label: 'Контакты поддержки',          type: 'textarea', default: 'По всем вопросам пишите: @username',
    hint: 'Текст который покажется при нажатии «Поддержка». Можно указать @username или прямую ссылку t.me.' },
  { key: 'doc_support_url',     group: 'docs',     label: 'Ссылка на чат поддержки',     type: 'text',     default: '',
    hint: 'Необязательно. Если задано — в боте появится кнопка-ссылка «Написать в поддержку». Формат: https://t.me/username' },
];

const GROUPS = [
  { id: 'bot',      label: 'Telegram-бот',          icon: '🤖', hint: 'Основные параметры: токен, канал, чат для логов.' },
  { id: 'offer',    label: 'Оффер и цены',         icon: '🛍', hint: 'Что и почем продаётся.' },
  { id: 'platega',  label: 'Platega',                icon: '💳', hint: 'Ключи для оплаты картами.' },
  { id: 'crypto',   label: 'CryptoBot',              icon: '🪙', hint: 'Ключи для оплаты криптой.' },
  { id: 'withdraw', label: 'Автовывод',              icon: '💸', hint: 'Накопление крипты и уведомления.' },
  { id: 'docs',     label: 'Документы и поддержка', icon: '📝', hint: 'Политика, соглашение и контакты поддержки — показываются в боте в меню «Информация».' },
];

const SECRET_KEYS = new Set(SETTINGS_META.filter(m => m.secret).map(m => m.key));
const META_BY_KEY = Object.fromEntries(SETTINGS_META.map(m => [m.key, m]));

function getMeta(key) { return META_BY_KEY[key]; }

function ensureDefaults() {
  for (const m of SETTINGS_META) {
    if (getSetting(m.key) === null) setSetting(m.key, m.default);
  }
}

module.exports = {
  getSetting, setSetting, getAllSettings, ensureDefaults,
  SETTINGS_META, GROUPS, SECRET_KEYS, getMeta
};
