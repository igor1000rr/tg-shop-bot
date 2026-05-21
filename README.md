# tg-shop-bot

Telegram-бот для продажи цифровых продуктов (доступ в закрытый канал).

Стек: Node.js + grammy + Fastify + SQLite + EJS, фронтенд админки на Tailwind через CDN.
Платежи: Platega (карты, РФ) + Cryptomus (крипта, USDT с автовыводом на внешний кошелёк).

## Запуск

```bash
cp .env.example .env  # заполнить PORT, PUBLIC_URL, ADMIN_LOGIN, ADMIN_PASSWORD
npm install
npm start
```

Все остальные настройки (токен бота, ключи Platega/Cryptomus, цены, тексты документов) хранятся в SQLite и редактируются через админку.

## Эндпоинты

- `GET  /admin` — админ-панель (логин/пароль из .env)
- `POST /webhook/platega` — приём callback от Platega
- `POST /webhook/cryptomus` — приём callback от Cryptomus
- `GET  /healthz` — health check
