const { getSetting } = require('../config');

async function issueAccess(bot, tgId) {
  const channelId = getSetting('channel_id');
  if (!channelId) throw new Error('channel_id не задан в админке');
  const expireDate = Math.floor(Date.now() / 1000) + 24 * 3600;
  const link = await bot.api.createChatInviteLink(channelId, {
    member_limit: 1,
    expire_date: expireDate,
    name: `user_${tgId}`
  });
  return link.invite_link;
}

module.exports = { issueAccess };
