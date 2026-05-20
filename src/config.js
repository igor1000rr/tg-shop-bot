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

const DEFAULTS = {
  offer_title: 'Доступ к закрытому каналу',
  offer_description: 'Описание продукта. Замените в админке.',
  offer_image_url: '',
  price_rub: '5000',
  price_usdt: '50',
  enable_card: '1',
  enable_crypto: '1',
  start_text: 'Привет! Здесь вы можете оплатить доступ к закрытому каналу.',
  success_text: 'Оплата принята. Ваша ссылка для входа: {invite_link}',
  legal_entity_type: 'Самозанятый',
  legal_name: '',
  legal_inn: '',
  legal_ogrn: '',
  legal_email: '',
  legal_phone: '',
  legal_address: '',
  legal_product_description: 'доступ к закрытому информационному каналу в Telegram'
};

function ensureDefaults() {
  for (const [k, v] of Object.entries(DEFAULTS)) {
    if (getSetting(k) === null) setSetting(k, v);
  }
}

module.exports = { getSetting, setSetting, getAllSettings, ensureDefaults, DEFAULTS };
