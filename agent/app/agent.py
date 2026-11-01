"""Цикл агента: модель думает, вызывает инструменты, получает результаты — пока не ответит."""

import logging
import threading
from collections import defaultdict
from typing import Callable

import anthropic

from . import config, tools

log = logging.getLogger("agent")

FALLBACK_BETA = "server-side-fallback-2026-07-01"


class Agent:
    def __init__(self) -> None:
        self.client = anthropic.Anthropic()  # ключ берётся из ANTHROPIC_API_KEY
        self._history: dict[str, list] = {}
        self._locks: defaultdict[str, threading.Lock] = defaultdict(threading.Lock)

    def reset(self, session_id: str) -> None:
        self._history.pop(session_id, None)

    def _call(self, messages: list):
        kwargs: dict = dict(
            model=config.MODEL,
            max_tokens=config.MAX_TOKENS,
            system=config.SYSTEM_PROMPT,
            messages=messages,
            tools=tools.tool_definitions(),
            thinking={"type": "adaptive"},
            output_config={"effort": config.EFFORT},
            cache_control={"type": "ephemeral"},  # кэширование истории — дешевле
        )
        if config.FALLBACKS == "default":
            kwargs["betas"] = [FALLBACK_BETA]
            kwargs["fallbacks"] = "default"
        return self.client.beta.messages.create(**kwargs)

    def chat(
        self,
        session_id: str,
        text: str,
        on_tool: Callable[[str], None] | None = None,
    ) -> str:
        """Отправить сообщение и получить итоговый ответ агента."""
        with self._locks[session_id]:
            # История только дополняется (append-only) — так сохраняется мышление модели
            messages = list(self._history.get(session_id, []))
            messages.append({"role": "user", "content": text})

            response = None
            for _ in range(config.MAX_STEPS):
                response = self._call(messages)
                messages.append({"role": "assistant", "content": response.content})

                if response.stop_reason == "pause_turn":
                    continue  # серверный инструмент (поиск) не успел — продолжаем

                if response.stop_reason == "tool_use":
                    results = []
                    for block in response.content:
                        if block.type != "tool_use":
                            continue
                        log.info("tool %s %s", block.name, block.input)
                        if on_tool:
                            on_tool(block.name)
                        output, is_error = tools.execute(block.name, block.input)
                        results.append(
                            {
                                "type": "tool_result",
                                "tool_use_id": block.id,
                                "content": output,
                                "is_error": is_error,
                            }
                        )
                    messages.append({"role": "user", "content": results})
                    continue
                break

            self._history[session_id] = messages

        if response is None:
            return "Нет ответа."
        if response.stop_reason == "refusal":
            return "Модель отказалась отвечать на этот запрос."
        answer = "\n".join(b.text for b in response.content if b.type == "text").strip()
        if response.stop_reason == "max_tokens":
            answer += "\n\n[ответ обрезан по лимиту токенов]"
        elif response.stop_reason == "tool_use":
            answer += f"\n\n[остановлено: достигнут лимит в {config.MAX_STEPS} шагов]"
        return answer or "(пустой ответ)"
