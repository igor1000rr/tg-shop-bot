const { getAllSettings } = require('../config');

async function registerLegal(app) {
  app.get('/terms',    async (_, reply) => reply.render('legal/terms.ejs',    { s: getAllSettings() }));
  app.get('/privacy',  async (_, reply) => reply.render('legal/privacy.ejs',  { s: getAllSettings() }));
  app.get('/refund',   async (_, reply) => reply.render('legal/refund.ejs',   { s: getAllSettings() }));
  app.get('/contacts', async (_, reply) => reply.render('legal/contacts.ejs', { s: getAllSettings() }));
}

module.exports = { registerLegal };
