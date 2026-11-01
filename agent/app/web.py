"""Веб-интерфейс и HTTP API агента. Запуск: python -m app.web"""

import hmac
import logging
from pathlib import Path

import anthropic
import uvicorn
from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from . import config
from .agent import Agent

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

app = FastAPI(title="Claude Agent")
agent = Agent()
STATIC = Path(__file__).parent / "static"


class ChatRequest(BaseModel):
    session_id: str
    message: str


class ResetRequest(BaseModel):
    session_id: str


def _check(password: str | None) -> None:
    if not config.WEB_PASSWORD:
        raise HTTPException(503, "WEB_PASSWORD не задан в .env — веб-доступ отключён")
    if not password or not hmac.compare_digest(password, config.WEB_PASSWORD):
        raise HTTPException(401, "Неверный пароль")


@app.get("/")
def index():
    return FileResponse(STATIC / "index.html")


@app.get("/healthz")
def health():
    return {"ok": True}


@app.post("/api/chat")
def chat(req: ChatRequest, x_password: str | None = Header(default=None)):
    _check(x_password)
    try:
        return {"reply": agent.chat(req.session_id, req.message)}
    except anthropic.RateLimitError:
        raise HTTPException(429, "Превышен лимит запросов к Claude API, попробуйте позже")
    except anthropic.APIStatusError as e:
        raise HTTPException(502, f"Ошибка Claude API ({e.status_code}): {e.message}")
    except anthropic.APIConnectionError:
        raise HTTPException(502, "Нет связи с Claude API")


@app.post("/api/reset")
def reset(req: ResetRequest, x_password: str | None = Header(default=None)):
    _check(x_password)
    agent.reset(req.session_id)
    return {"ok": True}


if __name__ == "__main__":
    uvicorn.run(app, host=config.WEB_HOST, port=config.WEB_PORT)
