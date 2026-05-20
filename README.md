# tg-shop-bot

Telegram-бот для продажи цифровых продуктов (доступ в закрытый канал).

Стек: Node.js + grammy + Fastify + SQLite + EJS.
Платежи: Platega (карты), CryptoBot (крипта). Автовывод USDT на Trust Wallet по cron.

## Запуск
```
cp .env.example .env  # заполнить
npm install
npm start
```

Webhooks: `POST /webhook/platega`, `POST /webhook/cryptobot`.
Админка: `/admin` (basic auth).
Юр. страницы: `/terms`, `/privacy`, `/refund`, `/contacts`.
