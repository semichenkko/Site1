# Claude Agent — свой ИИ-агент на сервере

Агент на модели **Claude Opus 5.5** (Claude API). Умеет:

- вести диалог и помнить историю внутри чата;
- искать в интернете и читать страницы (`web_search`, `web_fetch`);
- работать с файлами в своей рабочей папке (`list_files`, `read_file`, `write_file`);
- по желанию — выполнять команды в shell на сервере (`run_shell`, по умолчанию выключено).

Три способа общаться с агентом:

| Интерфейс | Команда |
|---|---|
| Веб-чат в браузере (с паролем) | `python -m app.web` → http://сервер:8000 |
| Telegram-бот | `python -m app.telegram_bot` |
| Терминал | `python -m app.cli` |

---

## 1. Что понадобится

1. **Ключ Claude API** — https://console.anthropic.com/settings/keys (нужен баланс на аккаунте).
2. **Сервер** (VPS) с Ubuntu 22.04+ и установленным Docker:
   ```bash
   curl -fsSL https://get.docker.com | sh
   ```
3. *(Необязательно)* токен Telegram-бота — создайте бота у [@BotFather](https://t.me/BotFather).

## 2. Развёртывание на сервере

```bash
git clone https://github.com/semichenkko/Site1.git
cd Site1/agent
cp .env.example .env
nano .env        # впишите ANTHROPIC_API_KEY и WEB_PASSWORD
```

Запуск веб-чата:

```bash
docker compose up -d --build
```

Откройте `http://IP_сервера:8000`, введите пароль из `WEB_PASSWORD` — готово.

Запуск вместе с Telegram-ботом (сначала заполните `TELEGRAM_BOT_TOKEN`):

```bash
docker compose --profile telegram up -d --build
```

Напишите боту любое сообщение — он ответит вашим Telegram ID. Впишите его в
`TELEGRAM_ALLOWED_USERS` в `.env` и перезапустите:

```bash
docker compose --profile telegram up -d
```

Полезные команды:

```bash
docker compose logs -f            # логи
docker compose --profile telegram down   # остановить всё
git pull && docker compose --profile telegram up -d --build   # обновить
```

## 3. HTTPS (рекомендуется)

Пароль по обычному HTTP передаётся открытым текстом. Если у вас есть домен, проще всего
поставить [Caddy](https://caddyserver.com/docs/install) — он сам получит сертификат:

```
# /etc/caddy/Caddyfile
agent.ваш-домен.ru {
    reverse_proxy localhost:8000
}
```

После этого в `docker-compose.yml` можно заменить `"8000:8000"` на `"127.0.0.1:8000:8000"`,
чтобы порт не был открыт наружу напрямую.

## 4. Локальный запуск без Docker

```bash
cd agent
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # заполните ANTHROPIC_API_KEY, поменяйте AGENT_WORKSPACE на ./workspace
python -m app.cli
```

## 5. Настройка

Все настройки — в `.env` (описаны в `.env.example`). Главное:

- `AGENT_EFFORT` — глубина размышлений: `low` (быстро и дёшево) … `max` (максимум качества).
- `AGENT_SYSTEM_PROMPT_FILE` — свой файл с инструкциями: кто агент, как себя вести.
- `AGENT_ALLOW_SHELL=true` — разрешить агенту выполнять команды. Команды выполняются
  внутри Docker-контейнера, но всё равно включайте это только для себя и с надёжным паролем.
- `AGENT_FALLBACKS=default` — если модель откажется отвечать по соображениям безопасности,
  API автоматически повторит запрос на другой модели Claude. `off` — выключить.

### Как добавить свой инструмент

В `app/tools.py`:

1. Напишите функцию, которая возвращает строку.
2. Добавьте её описание в словарь `_CUSTOM_TOOLS` (имя, описание, JSON-схема параметров).

Агент сам решит, когда её вызвать.

## 6. Устройство

```
agent/
├── app/
│   ├── agent.py         # цикл агента: модель → инструменты → модель …
│   ├── tools.py         # инструменты
│   ├── config.py        # настройки из .env
│   ├── web.py           # веб-чат + HTTP API (FastAPI)
│   ├── telegram_bot.py  # Telegram-бот
│   ├── cli.py           # чат в терминале
│   └── static/index.html
├── Dockerfile
├── docker-compose.yml
├── requirements.txt
└── .env.example
```

HTTP API: `POST /api/chat` с заголовком `X-Password` и телом
`{"session_id": "любая-строка", "message": "текст"}` → `{"reply": "..."}`.

**Ограничения:** история чатов хранится в памяти и сбрасывается при перезапуске;
файлы рабочей папки сохраняются в Docker-томе `agent-data`.
