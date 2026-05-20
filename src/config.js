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
    hint: '1) Добавьте бота в канал админом с правом «Пригласительные ссылки». 2) Перешлите любое сообщение из канала в @username_to_id_bot — он покажет ID. Формат: -100xxxxxxxxxx' },
  { key: 'log_chat_id',         group: 'bot',      label: 'ID чата для логов',                                           type: 'text',     default: '',
    hint: 'Необязательно. Бот будет присылать сюда уведомления об оплатах, ошибках, чарджбэках. Можно указать ваш личный ID (получите в @userinfobot).' },

  // Оффер
  { key: 'offer_title',         group: 'offer',    label: 'Заголовок',                                                  type: 'text',     default: 'Доступ к закрытому каналу',
    hint: 'Показывается первым в сообщении при /start в боте.' },
  { key: 'offer_description',   group: 'offer',    label: 'Описание',                                                   type: 'textarea', default: 'Описание продукта. Замените в админке.',
    hint: 'Следует под заголовком. Можно в несколько абзацев.' },
  { key: 'offer_image_url',     group: 'offer',    label: 'URL картинки',                                                type: 'text',     default: '',
    hint: 'Необязательно. Прямая ссылка на jpg/png. Если пусто — в боте покажется только текст.' },
  { key: 'price_rub',           group: 'offer',    label: 'Цена в ₽',                                                     type: 'text',     default: '5000',
    hint: 'Для оплаты картой через Platega. Целое число или дробное через точку.' },
  { key: 'price_usdt',          group: 'offer',    label: 'Цена в USDT',                                                  type: 'text',     default: '50',
    hint: 'Для оплаты криптой через CryptoBot.' },
  { key: 'enable_card',         group: 'offer',    label: 'Показывать кнопку оплаты картой',                            type: 'checkbox', default: '1',
    hint: 'Если выключено — кнопка исчезнет из /start в боте.' },
  { key: 'enable_crypto',       group: 'offer',    label: 'Показывать кнопку оплаты криптой',                           type: 'checkbox', default: '1' },
  { key: 'success_text',        group: 'offer',    label: 'Сообщение после оплаты',                                       type: 'textarea', default: 'Оплата принята. Ваша ссылка: {invite_link}',
    hint: 'Приходит в боте после успешной оплаты. Плейсхолдер {invite_link} будет заменён на реальную ссылку доступа.' },

  // Platega (карты)
  { key: 'platega_shop_id',     group: 'platega',  label: 'Shop ID (Merchant ID)',                                            type: 'password', secret: true, default: '',
    hint: 'UUID, выданный менеджером Platega. Доступен в ЛК Platega → Настройки.' },
  { key: 'platega_secret',      group: 'platega',  label: 'Secret Key (API ключ)',                                          type: 'password', secret: true, default: '',
    hint: 'Там же в ЛК Platega → Настройки. Не путать с Shop ID.' },
  { key: 'platega_payment_method', group: 'platega', label: 'Фиксированный метод оплаты',                                  type: 'text', default: '',
    hint: 'Пусто = у клиента будет выбор всех доступных методов (рекомендуется). Число = только один метод, напр. 2 — СБП.' },

  // CryptoBot
  { key: 'cryptobot_token',     group: 'crypto',   label: 'API Token',                                                        type: 'password', secret: true, default: '',
    hint: 'Открой @CryptoBot → My Apps → Create App. Сохрани токен вида 12345:AAxxxx.' },

  // Автовывод
  { key: 'withdraw_wallet',     group: 'withdraw', label: 'Адрес Trust Wallet',                                                type: 'text',     default: '',
    hint: 'Адрес кошелька в выбранной сети. Для TRC20 USDT это адрес вида T… (34 символа).' },
  { key: 'withdraw_network',    group: 'withdraw', label: 'Сеть',                                                            type: 'text',     default: 'TRC20',
    hint: 'TRC20 (рекомендуется, комиссия ~1 USDT), TON, BEP20, ERC20.' },
  { key: 'withdraw_asset',      group: 'withdraw', label: 'Криптовалюта',                                                    type: 'text',     default: 'USDT',
    hint: 'USDT, USDC, TON, BTC и др. — из списка CryptoBot.' },
  { key: 'withdraw_threshold',  group: 'withdraw', label: 'Порог уведомления',                                              type: 'text',     default: '50',
    hint: 'Бот пришлёт уведомление о выводе, когда накопится эта сумма в выбранной криптовалюте.' },
  { key: 'withdraw_cron',       group: 'withdraw', label: 'Расписание проверки (cron)',                                    type: 'text', default: '0 3 * * *',
    hint: 'Формат cron. Примеры: 0 3 * * * — в 3:00 каждый день; 0 */6 * * * — каждые 6 часов.' },

  // Юр. реквизиты
  { key: 'legal_entity_type',   group: 'legal',    label: 'Тип лица',                                                       type: 'text',     default: 'Самозанятый',
    hint: 'Самозанятый, ИП, ООО — выбрать по факту.' },
  { key: 'legal_name',          group: 'legal',    label: 'ФИО / Название',                                                 type: 'text',     default: '',
    hint: 'Для ип и самозанятого — фамилия имя отчество. Для ООО — полное название.' },
  { key: 'legal_inn',           group: 'legal',    label: 'ИНН',                                                              type: 'text',     default: '',
    hint: 'Обязательно для модерации Platega.' },
  { key: 'legal_ogrn',          group: 'legal',    label: 'ОГРНИП / ОГРН',                                                  type: 'text',     default: '',
    hint: 'Для ИП и ООО. Самозанятому — оставить пустым.' },
  { key: 'legal_email',         group: 'legal',    label: 'Email',                                                            type: 'text',     default: '',
    hint: 'Контакт для клиентов и бэкапов по оплатам.' },
  { key: 'legal_phone',         group: 'legal',    label: 'Телефон',                                                          type: 'text',     default: '' },
  { key: 'legal_address',       group: 'legal',    label: 'Адрес',                                                            type: 'textarea', default: '' },
  { key: 'legal_product_description', group: 'legal', label: 'Описание продукта в оферте',                                  type: 'text', default: 'доступ к закрытому информационному каналу в Telegram',
    hint: 'Одной фразой — что именно продаётся. Попадёт в Публичную оферту.' },
];

const GROUPS = [
  { id: 'bot',      label: 'Telegram-бот',     icon: '🤖', hint: 'Основные параметры бота: токен, канал, чат для логов.' },
  { id: 'offer',    label: 'Оффер и цены',    icon: '🛍', hint: 'Что и почем продаётся. Активность методов оплаты.' },
  { id: 'platega',  label: 'Platega',           icon: '💳', hint: 'Ключи для приёма оплаты банковскими картами.' },
  { id: 'crypto',   label: 'CryptoBot',         icon: '🪙', hint: 'Ключи для приёма оплаты криптовалютой.' },
  { id: 'withdraw', label: 'Автовывод',         icon: '💸', hint: 'Куда и как часто уведомлять о накоплении крипты для ручного вывода.' },
  { id: 'legal',    label: 'Юр. реквизиты',    icon: '📜', hint: 'Подставляются в Публичную оферту и Политику конфиденциальности.' },
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
