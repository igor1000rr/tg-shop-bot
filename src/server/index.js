const Fastify = require('fastify');
const path = require('path');
const { registerWebhooks } = require('./webhooks');
const { registerAdmin } = require('./admin');
const { registerLegal } = require('./legal');

async function startServer(bot) {
  const app = Fastify({ logger: false, bodyLimit: 5 * 1024 * 1024 });

  await app.register(require('@fastify/formbody'));
  await app.register(require('@fastify/view'), {
    engine: { ejs: require('ejs') },
    root: path.resolve(__dirname, '../../views'),
    propertyName: 'render'
  });

  app.get('/',               async (_, reply) => reply.redirect('/admin'));
  app.get('/return/success', async (_, reply) => reply.type('text/html').send('<h1>Оплата получена</h1><p>Вернитесь в Telegram-бот — доступ уже отправлен.</p>'));
  app.get('/return/fail',    async (_, reply) => reply.type('text/html').send('<h1>Оплата не прошла</h1><p>Попробуйте ещё раз в боте.</p>'));

  await registerWebhooks(app, bot);
  await registerLegal(app);
  await registerAdmin(app, bot);

  await app.listen({ port: Number(process.env.PORT) || 3000, host: '0.0.0.0' });
  return app;
}

module.exports = { startServer };
