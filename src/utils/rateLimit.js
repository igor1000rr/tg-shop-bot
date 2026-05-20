// Простой in-memory rate-limiter по ключу.
// Для production с множеством инстансов нужен Redis — но для одноинстансного бота этого достаточно.
const buckets = new Map();

function checkRateLimit(key, intervalMs = 20000) {
  const now = Date.now();
  const last = buckets.get(key) || 0;
  if (now - last < intervalMs) {
    return { ok: false, remainingMs: intervalMs - (now - last) };
  }
  buckets.set(key, now);

  // GC старых записей, чтобы Map не росла бесконечно
  if (buckets.size > 1000) {
    for (const [k, t] of buckets) {
      if (now - t > intervalMs * 5) buckets.delete(k);
    }
  }
  return { ok: true };
}

module.exports = { checkRateLimit };
