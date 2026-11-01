"""Чат с агентом прямо в терминале. Запуск: python -m app.cli"""

from .agent import Agent


def main() -> None:
    agent = Agent()
    print("Агент готов. /reset — очистить историю, /exit — выход.\n")
    while True:
        try:
            text = input("Вы: ").strip()
        except (EOFError, KeyboardInterrupt):
            break
        if not text:
            continue
        if text == "/exit":
            break
        if text == "/reset":
            agent.reset("cli")
            print("История очищена.\n")
            continue
        reply = agent.chat("cli", text, on_tool=lambda name: print(f"  [инструмент: {name}]"))
        print(f"\nАгент: {reply}\n")


if __name__ == "__main__":
    main()
