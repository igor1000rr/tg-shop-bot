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

// Метаданные всех настроек — тип, группа, ярлык, дефолт.
// На этом же списке строится UI админки и ensureDefaults().
const SETTINGS_META = [
  // Telegram-бот
  { key: 'bot_token',           group: 'bot',      label: 'BOT_TOKEN (от @BotFather)',                         type: 'password', secret: true,  default: '' },
  { key: 'channel_id',          group: 'bot',      label: 'ID закрытого канала (например -100123…)',       type: 'text',     default: '' },
  { key: 'log_chat_id',         group: 'bot',      label: 'ID чата для логов (необязательно)',         type: 'text',     default: '' },

  // Оффер и цены
  { key: 'offer_title',         group: 'offer',    label: 'Заголовок оффера',                              type: 'text',     default: 'Доступ к закрытому каналу' },
  { key: 'offer_description',   group: 'offer',    label: 'Описание оффера',                               type: 'textarea', default: 'Описание продукта. Замените в админке.' },
  { key: 'offer_image_url',     group: 'offer',    label: 'URL картинки оффера (необязательно)',         type: 'text',     default: '' },
  { key: 'price_rub',           group: 'offer',    label: 'Цена в ₽ (для оплаты картой)',                  type: 'text',     default: '5000' },
  { key: 'price_usdt',          group: 'offer',    label: 'Цена в USDT (для оплаты криптой)',              type: 'text',     default: '50' },
  { key: 'enable_card',         group: 'offer',    label: 'Включить оплату картой (Platega)',         type: 'checkbox', default: '1' },
  { key: 'enable_crypto',       group: 'offer',    label: 'Включить оплату криптой (CryptoBot)',      type: 'checkbox', default: '1' },
  { key: 'success_text',        group: 'offer',    label: 'Сообщение после оплаты (доступно {invite_link})', type: 'textarea', default: 'Оплата принята. Ваша ссылка: {invite_link}' },

  // Platega (карты)
  { key: 'platega_shop_id',     group: 'platega',  label: 'Platega Shop ID (Merchant ID)',                  type: 'password', secret: true, default: '' },
  { key: 'platega_secret',      group: 'platega',  label: 'Platega Secret Key',                             type: 'password', secret: true, default: '' },
  { key: 'platega_payment_method', group: 'platega', label: 'Метод оплаты (пусто = выбор всех методов; число = фикс метод, напр. 2 = СБП)', type: 'text', default: '' },

  // CryptoBot (крипта)
  { key: 'cryptobot_token',     group: 'crypto',   label: 'CryptoBot API Token (@CryptoBot → My Apps)',     type: 'password', secret: true, default: '' },

  // Автовывод
  { key: 'withdraw_wallet',     group: 'withdraw', label: 'Адрес Trust Wallet для вывода',                 type: 'text',     default: '' },
  { key: 'withdraw_network',    group: 'withdraw', label: 'Сеть (TRC20, TON, BEP20)',                       type: 'text',     default: 'TRC20' },
  { key: 'withdraw_asset',      group: 'withdraw', label: 'Криптовалюта (USDT, USDC, TON)',                  type: 'text',     default: 'USDT' },
  { key: 'withdraw_threshold',  group: 'withdraw', label: 'Порог для уведомления о выводе',                  type: 'text',     default: '50' },
  { key: 'withdraw_cron',       group: 'withdraw', label: 'Расписание cron (по умолчанию: 0 3 * * * — в 3:00)', type: 'text', default: '0 3 * * *' },

  // Юр. реквизиты (для оферты и политики)
  { key: 'legal_entity_type',   group: 'legal',    label: 'Тип лица (Самозанятый / ИП / ООО)',            type: 'text',     default: 'Самозанятый' },
  { key: 'legal_name',          group: 'legal',    label: 'ФИО / Название',                                 type: 'text',     default: '' },
  { key: 'legal_inn',           group: 'legal',    label: 'ИНН',                                              type: 'text',     default: '' },
  { key: 'legal_ogrn',          group: 'legal',    label: 'ОГРНИП / ОГРН',                                  type: 'text',     default: '' },
  { key: 'legal_email',         group: 'legal',    label: 'Email для связи',                              type: 'text',     default: '' },
  { key: 'legal_phone',         group: 'legal',    label: 'Телефон',                                          type: 'text',     default: '' },
  { key: 'legal_address',       group: 'legal',    label: 'Адрес',                                            type: 'textarea', default: '' },
  { key: 'legal_product_description', group: 'legal', label: 'Описание продукта в оферте',               type: 'text',     default: 'доступ к закрытому информационному каналу в Telegram' },
];

const GROUPS = [
  { id: 'bot',      label: '🤖 Telegram-бот' },
  { id: 'offer',    label: '🛍 Оффер и цены' },
  { id: 'platega',  label: '💳 Platega (карты)' },
  { id: 'crypto',   label: '🪙 CryptoBot (крипта)' },
  { id: 'withdraw', label: '💸 Автовывод на Trust Wallet' },
  { id: 'legal',    label: '📜 Юридические реквизиты' },
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
