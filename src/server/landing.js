const path = require('path');
const fs = require('fs');

// Кешируем HTML лендинга в памяти при старте, чтобы каждый запрос не читал файл с диска.
const landingPath = path.resolve(__dirname, '../../public/index.html');
let landingHtml = null;
try {
  landingHtml = fs.readFileSync(landingPath, 'utf8');
} catch (e) {
  console.error('Не удалось прочитать public/index.html:', e?.message);
}

async function registerLanding(app) {
  app.get('/', async (_, reply) => {
    if (landingHtml) {
      return reply.type('text/html; charset=utf-8').send(landingHtml);
    }
    // Фолбэк: если файла нет, отправляем в админку
    return reply.redirect('/admin');
  });
}

module.exports = { registerLanding };
