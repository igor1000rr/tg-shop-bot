const Fastify = require('fastify');
const path = require('path');
const { registerWebhooks } = require('./webhooks');
const { registerAdmin } = require('./admin');
const { registerLegal } = require('./legal');

async function startServer() {
  const app = Fastify({ logger: false, bodyLimit: 5 * 1024 * 1024 });

  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
    try {
      req.rawBody = body;
      done(null, body.length ? JSON.parse(body.toString('utf8')) : {});
    } catch (e) { done(e); }
  });

  await app.register(require('@fastify/formbody'));
  await app.register(require('@fastify/cookie'));
  await app.register(require('@fastify/view'), {
    engine: { ejs: require('ejs') },
    root: path.resolve(__dirname, '../../views'),
    propertyName: 'render'
  });

  app.get('/',               async (_, reply) => reply.redirect('/admin'));
  app.get('/healthz',        async (_, reply) => reply.send({ ok: true, ts: new Date().toISOString() }));
  app.get('/return/success', async (_, reply) => reply.type('text/html; charset=utf-8').send(returnPage('success')));
  app.get('/return/fail',    async (_, reply) => reply.type('text/html; charset=utf-8').send(returnPage('fail')));

  await registerWebhooks(app);
  await registerLegal(app);
  await registerAdmin(app);

  await app.listen({ port: Number(process.env.PORT) || 3000, host: '0.0.0.0' });
  return app;
}

function returnPage(kind) {
  const isSuccess = kind === 'success';
  return `<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${isSuccess ? 'Оплата получена' : 'Оплата не прошла'}</title>
<script src="https://cdn.tailwindcss.com"></script>
</head><body class="bg-slate-50 min-h-screen flex items-center justify-center p-6">
<div class="bg-white rounded-2xl shadow-xl p-10 max-w-md text-center">
  <div class="text-6xl mb-4">${isSuccess ? '✅' : '❌'}</div>
  <h1 class="text-2xl font-bold text-slate-900 mb-3">${isSuccess ? 'Оплата получена' : 'Оплата не прошла'}</h1>
  <p class="text-slate-600">${isSuccess ? 'Вернитесь в Telegram-бот — доступ отправлен автоматически.' : 'Попробуйте ещё раз в боте.'}</p>
</div>
</body></html>`;
}

module.exports = { startServer };
