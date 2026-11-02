"""Инструменты, которые агент может вызывать. Добавляйте свои по образцу."""

import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from . import config

MAX_OUTPUT_CHARS = 50_000


def _safe_path(relative: str) -> Path:
    """Путь внутри рабочей папки; выход за её пределы запрещён."""
    config.WORKSPACE.mkdir(parents=True, exist_ok=True)
    path = (config.WORKSPACE / relative).resolve()
    if not path.is_relative_to(config.WORKSPACE):
        raise ValueError(f"Путь '{relative}' выходит за пределы рабочей папки")
    return path


def _truncate(text: str) -> str:
    if len(text) <= MAX_OUTPUT_CHARS:
        return text
    return text[:MAX_OUTPUT_CHARS] + f"\n...[обрезано, всего {len(text)} символов]"


# ---------- реализации ----------

def get_current_time() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def list_files(path: str) -> str:
    target = _safe_path(path)
    if not target.exists():
        return "Папка не существует"
    items = sorted(target.iterdir())
    if not items:
        return "(пусто)"
    return "\n".join(
        f"{p.name}/" if p.is_dir() else f"{p.name}  ({p.stat().st_size} байт)" for p in items
    )


def read_file(path: str) -> str:
    return _truncate(_safe_path(path).read_text(encoding="utf-8", errors="replace"))


def write_file(path: str, content: str) -> str:
    target = _safe_path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")
    return f"Записано {len(content)} символов в {path}"


def run_shell(command: str) -> str:
    config.WORKSPACE.mkdir(parents=True, exist_ok=True)
    proc = subprocess.run(
        command,
        shell=True,
        cwd=config.WORKSPACE,
        capture_output=True,
        text=True,
        timeout=config.SHELL_TIMEOUT,
    )
    return _truncate(
        f"exit code: {proc.returncode}\n--- stdout ---\n{proc.stdout}\n--- stderr ---\n{proc.stderr}"
    )


# ---------- описания для модели ----------

def _schema(properties: dict, required: list[str]) -> dict:
    return {
        "type": "object",
        "properties": properties,
        "required": required,
        "additionalProperties": False,
    }


_PATH = {"type": "string", "description": "Путь относительно рабочей папки, например 'notes/todo.md' или '.'"}

_CUSTOM_TOOLS: dict[str, tuple[dict, Callable[..., str]]] = {
    "get_current_time": (
        {
            "name": "get_current_time",
            "description": "Текущие дата и время на сервере.",
            "input_schema": _schema({}, []),
        },
        get_current_time,
    ),
    "list_files": (
        {
            "name": "list_files",
            "description": "Список файлов и папок в рабочей папке агента.",
            "input_schema": _schema({"path": _PATH}, ["path"]),
        },
        list_files,
    ),
    "read_file": (
        {
            "name": "read_file",
            "description": "Прочитать текстовый файл из рабочей папки.",
            "input_schema": _schema({"path": _PATH}, ["path"]),
        },
        read_file,
    ),
    "write_file": (
        {
            "name": "write_file",
            "description": "Создать или перезаписать текстовый файл в рабочей папке.",
            "input_schema": _schema(
                {"path": _PATH, "content": {"type": "string", "description": "Полное содержимое файла"}},
                ["path", "content"],
            ),
        },
        write_file,
    ),
}

if config.ALLOW_SHELL:
    _CUSTOM_TOOLS["run_shell"] = (
        {
            "name": "run_shell",
            "description": (
                "Выполнить shell-команду на сервере (bash, рабочая папка агента). "
                f"Таймаут {config.SHELL_TIMEOUT} с. Возвращает код выхода, stdout и stderr."
            ),
            "input_schema": _schema(
                {"command": {"type": "string", "description": "Команда для выполнения"}},
                ["command"],
            ),
        },
        run_shell,
    )


def tool_definitions() -> list[dict]:
    defs = [{**schema, "strict": True} for schema, _ in _CUSTOM_TOOLS.values()]
    if config.WEB_TOOLS:
        # Серверные инструменты: выполняются на стороне Anthropic, код не нужен
        defs.append({"type": "web_search_20260209", "name": "web_search", "max_uses": 5})
        defs.append({"type": "web_fetch_20260209", "name": "web_fetch", "max_uses": 5})
    return defs


def execute(name: str, tool_input: dict[str, Any]) -> tuple[str, bool]:
    """Выполнить инструмент. Возвращает (результат, is_error)."""
    entry = _CUSTOM_TOOLS.get(name)
    if entry is None:
        return f"Неизвестный инструмент: {name}", True
    try:
        return entry[1](**tool_input), False
    except Exception as exc:  # ошибка уходит модели, а не роняет агента
        return f"Ошибка: {type(exc).__name__}: {exc}", True
