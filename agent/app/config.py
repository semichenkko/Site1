"""Настройки агента. Всё берётся из переменных окружения (файл .env)."""

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()


def _bool(name: str, default: bool = False) -> bool:
    return os.getenv(name, str(default)).strip().lower() in ("1", "true", "yes", "on")


# --- Модель ---
MODEL = os.getenv("AGENT_MODEL", "claude-opus-5-5")
# low | medium | high | xhigh | max — насколько глубоко модель думает
EFFORT = os.getenv("AGENT_EFFORT", "high")
MAX_TOKENS = int(os.getenv("AGENT_MAX_TOKENS", "16000"))
# Максимум шагов (вызовов модели) на одно сообщение пользователя
MAX_STEPS = int(os.getenv("AGENT_MAX_STEPS", "25"))
# Серверный фолбэк при отказе модели: "default" или "off"
FALLBACKS = os.getenv("AGENT_FALLBACKS", "default")

# --- Инструменты ---
WORKSPACE = Path(os.getenv("AGENT_WORKSPACE", "./workspace")).resolve()
WEB_TOOLS = _bool("AGENT_WEB_TOOLS", True)
# Выполнение shell-команд на сервере. ОПАСНО — включайте осознанно.
ALLOW_SHELL = _bool("AGENT_ALLOW_SHELL", False)
SHELL_TIMEOUT = int(os.getenv("AGENT_SHELL_TIMEOUT", "60"))

# --- Системный промпт ---
_DEFAULT_SYSTEM = """Ты — персональный ИИ-ассистент, работающий на сервере владельца.
Отвечай на языке пользователя (по умолчанию — по-русски), кратко и по делу.
У тебя есть инструменты: рабочая папка с файлами, поиск и чтение страниц в интернете,
а также (если включено) выполнение команд в shell. Пользуйся ими, когда это помогает
ответить точнее. Перед действиями, которые что-то удаляют или меняют необратимо,
спрашивай подтверждение."""

_prompt_file = os.getenv("AGENT_SYSTEM_PROMPT_FILE")
SYSTEM_PROMPT = (
    Path(_prompt_file).read_text(encoding="utf-8") if _prompt_file else _DEFAULT_SYSTEM
)

# --- Веб-интерфейс ---
WEB_PASSWORD = os.getenv("WEB_PASSWORD", "")
WEB_HOST = os.getenv("WEB_HOST", "0.0.0.0")
WEB_PORT = int(os.getenv("WEB_PORT", "8000"))

# --- Telegram ---
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_ALLOWED_USERS = {
    int(x) for x in os.getenv("TELEGRAM_ALLOWED_USERS", "").replace(" ", "").split(",") if x
}
