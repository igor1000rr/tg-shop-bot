const path = require('path');

async function registerLanding(app) {
  // Главный лендинг на корне
  app.get('/', async (_, reply) => {
    return reply.render('landing/index.ejs', {
      botUrl: 'https://t.me/AiCartoons_bot'
    });
  });
}

module.exports = { registerLanding };
