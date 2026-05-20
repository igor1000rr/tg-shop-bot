const Fastify = require('fastify');
const path = require('path');
const { registerWebhooks } = require('./webhooks');
const { registerAdmin } = require('./admin');
const { registerLegal } = require('./legal');

async function startServer(bot) {
  const app = Fastify({ logger: false, bodyLimit: 5 * 1024 * 1024 });

  // raw body для JSON — нужен для проверки HMAC-подписи CryptoBot.
  // Без removeContentTypeParser Fastify бросит FST_ERR_CTP_ALREADY_PRESENT.
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
    try {
      req.rawBody = body;
      done(null, body.length ? JSON.parse(body.toString('utf8')) : {});
    } catch (e) { done(e); }
  });

  await app.register(require('@fastify/formbody'));
  await app.register(require('@fastify/view'), {
    engine: { ejs: require('ejs') },
    root: path.resolve(__dirname, '../../views'),
    propertyName: 'render'
  });

  app.get('/',               async (_, reply) => reply.redirect('/admin'));
  app.get('/healthz',        async (_, reply) => reply.send({ ok: true, ts: new Date().toISOString() }));
  app.get('/return/success', async (_, reply) => reply.type('text/html; charset=utf-8').send('<h1>Оплата получена</h1><p>Вернитесь в Telegram-бот — доступ отправлен автоматически.</p>'));
  app.get('/return/fail',    async (_, reply) => reply.type('text/html; charset=utf-8').send('<h1>Оплата не прошла</h1><p>Попробуйте ещё раз в боте.</p>'));

  await registerWebhooks(app, bot);
  await registerLegal(app);
  await registerAdmin(app, bot);

  await app.listen({ port: Number(process.env.PORT) || 3000, host: '0.0.0.0' });
  return app;
}

module.exports = { startServer };
