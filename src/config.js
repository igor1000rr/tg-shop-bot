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
    hint: 'Получить в @BotFather: /newbot → выбрать имя → бот выдаст токен вида 1234:ABCDxxx.' },
  { key: 'channel_id',          group: 'bot',      label: 'ID закрытого канала',                                          type: 'text',     default: '',
    hint: 'Формат: -100xxxxxxxxxx. Бот должен быть админом с правом «Пригласительные ссылки».' },
  { key: 'log_chat_id',         group: 'bot',      label: 'ID чата для логов',                                           type: 'text',     default: '',
    hint: 'Необязательно. Сюда приходят уведомления об оплатах, выводах и ошибках.' },

  // Оффер
  { key: 'offer_title',         group: 'offer',    label: 'Заголовок',                                                  type: 'text',     default: 'Доступ к закрытому каналу' },
  { key: 'offer_description',   group: 'offer',    label: 'Описание',                                                   type: 'textarea', default: 'Описание продукта. Замените в админке.' },
  { key: 'offer_image_url',     group: 'offer',    label: 'URL картинки',                                                type: 'text',     default: '',
    hint: 'Необязательно.' },
  { key: 'price_rub',           group: 'offer',    label: 'Цена в ₽ (для Platega)',                                     type: 'text',     default: '5000' },
  { key: 'price_usd',           group: 'offer',    label: 'Цена в USD (для Cryptomus)',                                  type: 'text',     default: '50',
    hint: 'Cryptomus покажет эквивалент в любой крипте (USDT, BTC, ETH и т.д.) на странице оплаты.' },
  { key: 'enable_card',         group: 'offer',    label: 'Показывать кнопку оплаты картой',                            type: 'checkbox', default: '1' },
  { key: 'enable_crypto',       group: 'offer',    label: 'Показывать кнопку оплаты криптой',                           type: 'checkbox', default: '1' },
  { key: 'success_text',        group: 'offer',    label: 'Сообщение после оплаты',                                       type: 'textarea', default: 'Оплата принята. Ваша ссылка: {invite_link}',
    hint: 'Плейсхолдер {invite_link} будет заменён на реальную ссылку.' },

  // Platega (карты)
  { key: 'platega_shop_id',     group: 'platega',  label: 'Shop ID (Merchant ID)',                                            type: 'password', secret: true, default: '' },
  { key: 'platega_secret',      group: 'platega',  label: 'Secret Key (API ключ)',                                          type: 'password', secret: true, default: '' },
  { key: 'platega_payment_method', group: 'platega', label: 'Фиксированный метод оплаты',                                  type: 'text', default: '',
    hint: 'Пусто = выбор всех методов.' },

  // Cryptomus (крипта)
  { key: 'cryptomus_merchant_uuid',  group: 'crypto', label: 'Merchant UUID',     type: 'password', secret: true, default: '',
    hint: 'В ЛК Cryptomus → Merchant → нажать на свой магазин → вверху UUID (вида e1830f1b-...).' },
  { key: 'cryptomus_payment_api_key',group: 'crypto', label: 'Payment API Key',   type: 'password', secret: true, default: '',
    hint: 'В магазине → Settings → Payment API → Create Key. Используется для приёма платежей.' },
  { key: 'cryptomus_payout_api_key', group: 'crypto', label: 'Payout API Key',    type: 'password', secret: true, default: '',
    hint: 'Отдельный ключ для автовывода. В магазине → Settings → Payout API → Create Key. Без него автовывод не работает — придёт только уведомление о балансе.' },

  // Автовывод крипты
  { key: 'withdraw_enabled',    group: 'withdraw', label: 'Автовывод включён',                                          type: 'checkbox', default: '0',
    hint: 'Если включено и задан Payout API Key — после каждой оплаты сработает cron и сбросит баланс на ваш кошелёк.' },
  { key: 'withdraw_wallet',     group: 'withdraw', label: 'Адрес кошелька',                                                type: 'text',     default: '',
    hint: 'Для USDT TRC20 — адрес вида T... (34 символа). Для TON или других сетей — соответствующий формат.' },
  { key: 'withdraw_network',    group: 'withdraw', label: 'Сеть',                                                            type: 'text',     default: 'TRON',
    hint: 'TRON (USDT TRC20, рекомендуется), BSC, ETH, TON.' },
  { key: 'withdraw_asset',      group: 'withdraw', label: 'Криптовалюта',                                                    type: 'text',     default: 'USDT' },
  { key: 'withdraw_threshold',  group: 'withdraw', label: 'Минимальная сумма вывода',                                       type: 'text',     default: '10',
    hint: 'Бот не будет выводить меньше этой суммы. Cryptomus свой минимум — обычно $10.' },
  { key: 'withdraw_cron',       group: 'withdraw', label: 'Расписание проверки баланса (cron)',                          type: 'text', default: '*/30 * * * *',
    hint: 'Примеры: */30 * * * * — каждые 30 минут; 0 */6 * * * — каждые 6 часов.' },

  // Документы и поддержка
  { key: 'doc_privacy',         group: 'docs',     label: 'Политика конфиденциальности', type: 'textarea', default: '' },
  { key: 'doc_terms',           group: 'docs',     label: 'Пользовательское соглашение',     type: 'textarea', default: '' },
  { key: 'doc_support_text',    group: 'docs',     label: 'Контакты поддержки',          type: 'textarea', default: 'По всем вопросам пишите: @username' },
  { key: 'doc_support_url',     group: 'docs',     label: 'Ссылка на чат поддержки',     type: 'text',     default: '',
    hint: 'Необязательно. Формат: https://t.me/username' },
];

const GROUPS = [
  { id: 'bot',      label: 'Telegram-бот',          icon: '🤖', hint: 'Основные параметры: токен, канал, чат для логов.' },
  { id: 'offer',    label: 'Оффер и цены',         icon: '🛍', hint: 'Что и почем продаётся.' },
  { id: 'platega',  label: 'Platega',                icon: '💳', hint: 'Ключи для оплаты картами.' },
  { id: 'crypto',   label: 'Cryptomus',              icon: '🪙', hint: 'Ключи для приёма крипты и автовывода.' },
  { id: 'withdraw', label: 'Автовывод крипты',     icon: '💸', hint: 'Куда и как часто выводить поступившие средства на ваш кошелёк.' },
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
