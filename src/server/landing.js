const path = require('path');
const fs = require('fs');

const publicDir = path.resolve(__dirname, '../../public');
const landingPath = path.join(publicDir, 'index.html');

// Разрешённые статические файлы (по расширению) и их MIME-типы.
const MIME = {
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.json': 'application/json'
};

function safeJoin(file) {
  // Защита от path traversal: финальный путь должен оставаться внутри publicDir.
  const resolved = path.resolve(publicDir, '.' + file);
  if (!resolved.startsWith(publicDir + path.sep)) return null;
  return resolved;
}

async function registerLanding(app) {
  // Главный лендинг (всегда отдаём свежий с диска, чтобы видеть изменения без рестарта)
  app.get('/', async (_, reply) => {
    try {
      const html = fs.readFileSync(landingPath, 'utf8');
      return reply.type('text/html; charset=utf-8').send(html);
    } catch {
      return reply.redirect('/admin');
    }
  });

  // Статика из public/ — только разрешённые расширения с защитой от path traversal
  app.get('/*', async (req, reply) => {
    const url = req.params['*'];
    if (!url) return reply.code(404).send({ error: 'not found' });

    // Блокируем доступ к /admin, /webhook, /healthz и т.п. — у них свои хендлеры
    if (url.startsWith('admin') || url.startsWith('webhook') || url.startsWith('return') || url === 'healthz') {
      return reply.code(404).send({ error: 'not found' });
    }

    const ext = path.extname(url).toLowerCase();
    const mime = MIME[ext];
    if (!mime) return reply.code(404).send({ error: 'not found' });

    const fullPath = safeJoin('/' + url);
    if (!fullPath || !fs.existsSync(fullPath)) return reply.code(404).send({ error: 'not found' });

    try {
      const data = fs.readFileSync(fullPath);
      return reply
        .type(mime)
        .header('cache-control', 'public, max-age=300')
        .send(data);
    } catch {
      return reply.code(404).send({ error: 'not found' });
    }
  });
}

module.exports = { registerLanding };
