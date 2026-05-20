// HTML-экранирование для Telegram (parse_mode=HTML).
// Telegram отклонит сообщение, если в тексте встретится неэкранированный
// `<`, `>` или `&` вне разрешённых тегов — используем для всех пользовательских данных.
function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

module.exports = { escapeHtml };
