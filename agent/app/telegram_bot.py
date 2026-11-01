"""Telegram-бот с агентом. Запуск: python -m app.telegram_bot"""

import asyncio
import logging

import anthropic
from telegram import Update
from telegram.constants import ChatAction
from telegram.ext import Application, CommandHandler, ContextTypes, MessageHandler, filters

from . import config
from .agent import Agent

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logging.getLogger("httpx").setLevel(logging.WARNING)

agent = Agent()
TG_LIMIT = 4000


def _allowed(update: Update) -> bool:
    return update.effective_user is not None and update.effective_user.id in config.TELEGRAM_ALLOWED_USERS


async def _deny(update: Update) -> None:
    uid = update.effective_user.id if update.effective_user else "?"
    await update.message.reply_text(
        f"Доступ закрыт. Ваш Telegram ID: {uid}\n"
        "Добавьте его в TELEGRAM_ALLOWED_USERS в файле .env и перезапустите бота."
    )


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _allowed(update):
        return await _deny(update)
    await update.message.reply_text("Привет! Я ваш агент на Claude. Пишите задачу.\n/reset — начать заново.")


async def reset(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _allowed(update):
        return await _deny(update)
    agent.reset(f"tg:{update.effective_chat.id}")
    await update.message.reply_text("История очищена.")


async def _keep_typing(chat) -> None:
    while True:
        await chat.send_action(ChatAction.TYPING)
        await asyncio.sleep(4)


async def on_message(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _allowed(update):
        return await _deny(update)
    typing = asyncio.create_task(_keep_typing(update.effective_chat))
    try:
        reply = await asyncio.to_thread(agent.chat, f"tg:{update.effective_chat.id}", update.message.text)
    except anthropic.APIStatusError as e:
        reply = f"Ошибка Claude API ({e.status_code}): {e.message}"
    except anthropic.APIConnectionError:
        reply = "Нет связи с Claude API, попробуйте позже."
    finally:
        typing.cancel()
    for i in range(0, len(reply), TG_LIMIT):
        await update.message.reply_text(reply[i : i + TG_LIMIT])


def main() -> None:
    if not config.TELEGRAM_BOT_TOKEN:
        raise SystemExit("TELEGRAM_BOT_TOKEN не задан в .env")
    app = Application.builder().token(config.TELEGRAM_BOT_TOKEN).concurrent_updates(True).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("reset", reset))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, on_message))
    app.run_polling()


if __name__ == "__main__":
    main()
