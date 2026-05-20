async function issueAccess(bot, tgId) {
  const channelId = process.env.CHANNEL_ID;
  if (!channelId) throw new Error('CHANNEL_ID не задан');
  const expireDate = Math.floor(Date.now() / 1000) + 24 * 3600;
  const link = await bot.api.createChatInviteLink(channelId, {
    member_limit: 1,
    expire_date: expireDate,
    name: `user_${tgId}`
  });
  return link.invite_link;
}

module.exports = { issueAccess };
