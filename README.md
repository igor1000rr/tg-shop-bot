# tg-shop-bot

Telegram-бот для продажи цифровых продуктов (доступ в закрытый канал).

Стек: Node.js + grammy + Fastify + SQLite + EJS, фронтенд админки на Tailwind через CDN.
Платежи: Platega (карты, РФ) + Telegram Stars (оплата звёздами внутри Telegram).

## Запуск

```bash
cp .env.example .env  # заполнить PORT, PUBLIC_URL, ADMIN_LOGIN, ADMIN_PASSWORD
npm install
npm start
```

Все остальные настройки (токен бота, ключи Platega, цены в ₽ и ⭐, ID администратора, тексты документов) хранятся в SQLite и редактируются через админку.

## Платежи

- **Platega** (карты) — через внешний callback `POST /webhook/platega` + опрос статусов (cron на случай потери вебхука).
- **Telegram Stars** — оплата внутри Telegram (`sendInvoice` с валютой `XTR`, без provider-токена). Вебхук не нужен: бот ловит `pre_checkout_query` и `successful_payment`, доступ выдаётся сразу. Возврат — `/refund <tg_id> <charge_id>` (только администратору). Обязательная команда `/paysupport` по правилам Telegram.

## Эндпоинты

- `GET  /admin` — админ-панель (логин/пароль из .env)
- `POST /webhook/platega` — приём callback от Platega
- `GET  /healthz` — health check
