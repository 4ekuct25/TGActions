#!/usr/bin/env python3
"""Проверка самой проверки: есть ли у стенда tools/engine-harness.js зубы.

    python3 tools/mutation-check.py

Вносит по одному заведомому дефекту в каждый модуль src/03-engine/, пересобирает
сценарий и сравнивает трассу с эталонной. Мутация, которая НЕ поменяла трассу, —
это непокрытая ветка: стенд про неё ничего не знает и регрессию в ней не поймает.

Эталон — трасса текущего собранного движка. Файлы модулей восстанавливаются из
памяти после каждой мутации; при падении скрипта восстановление идёт в finally.
"""

import json
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MODULES = ROOT / "src" / "03-engine"
EXPORT = ROOT / "3. Telegram for Sprut. Part 2. Engine.json"

# (файл, что заменить, на что[, причина-почему-заведомо-не-ловится])
#
# Четвёртый элемент = осознанно принятая слепая зона: мутация трассу не меняет,
# и это ожидаемо. Такие не роняют скрипт, но печатаются — чтобы список слепых
# зон был виден, а не растворялся в «всё зелено».
MUTATIONS = [
    ("polling.js", "backoff > 60000", "backoff > 70000"),
    (
        "polling.js",
        "inFlight[botName] = true;",
        "inFlight[botName] = false;",
        "защита от повторного входа в pollOnce: срабатывает, только если таймер "
        "сработал до возврата предыдущего long-poll. В стенде HTTP синхронный и "
        "поток один, через публичный API ветка недостижима",
    ),
    (
        "state.js",
        "ids[String(global.TGActionsSettings.chats[k])] = true;",
        "ids[String(k)] = true;",
    ),
    ("handlers.js", "if (btn && btn.text === text) {", "if (btn) {"),
    # Групповые команды: без отсечения @botname семейный чат не работает вовсе.
    ("handlers.js", "return at === -1 ? name : name.substring(0, at);", "return name;"),
    # Проброс автора: на нём держится доступ на уровне человека.
    (
        "handlers.js",
        "ctx.userId = from && from.id !== undefined ? String(from.id) : null;",
        "ctx.userId = null;",
    ),
    (
        "helpers.js",
        "return CONSTANTS.API_URL_BASE + '/bot' + botKey + path;",
        "return CONSTANTS.API_URL_BASE + '/bot/' + botKey + path;",
    ),
    ("commands.js", "if (commandsRegistered[botName]) {", "if (false) {"),
    ("updates.js", "pollOffsets[botName] = maxId + 1;", "pollOffsets[botName] = maxId;"),
    (
        "logger.js",
        "impl = global.LoggerFactory.create('TGActions' + ver);",
        "impl = global.LoggerFactory.create('TGActions');",
    ),
    ("messaging.js", "keyboard: rows, resize_keyboard: true", "keyboard: rows"),
    ("bot-meta.js", "CONSTANTS.SET_DESCRIPTION_ENDPOINT", "'/setMyDescriptionX'"),
    ("constants.js", "DEFAULT_POLL_TIMEOUT: 9", "DEFAULT_POLL_TIMEOUT: 42"),
    (
        "index.js",
        "rebootPolling: ns.polling.rebootPolling",
        "rebootPollingTypo: ns.polling.rebootPolling",
    ),
]


def build_and_trace(tmp):
    """Пересобрать экспорт и вернуть трассу стенда для собранного скрипта."""
    subprocess.run(
        [sys.executable, "tools/scenarios.py", "build"],
        cwd=ROOT, check=True, capture_output=True,
    )
    data = json.loads(EXPORT.read_text(encoding="utf-8"))["scenarioTemplate"]["data"]
    script = tmp / "engine.js"
    script.write_text(data, encoding="utf-8")
    done = subprocess.run(
        ["node", "tools/engine-harness.js", str(script)],
        cwd=ROOT, capture_output=True, text=True,
    )
    # Падение стенда — тоже наблюдаемое отличие, возвращаем stderr как трассу.
    return done.stdout if done.returncode == 0 else "HARNESS FAILED\n" + done.stderr


def main():
    originals = {p.name: p.read_bytes() for p in MODULES.glob("*.js")}
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        baseline = build_and_trace(tmp)

        blind = []
        expected_blind = []
        try:
            for mutation in MUTATIONS:
                name, old, new = mutation[0], mutation[1], mutation[2]
                reason = mutation[3] if len(mutation) > 3 else None
                path = MODULES / name
                text = path.read_text(encoding="utf-8")
                if text.count(old) != 1:
                    raise SystemExit(
                        f"{name}: паттерн {old!r} встречается {text.count(old)} раз — "
                        f"мутация неоднозначна, поправьте MUTATIONS"
                    )
                path.write_text(text.replace(old, new), encoding="utf-8")
                try:
                    traced = build_and_trace(tmp)
                finally:
                    path.write_bytes(originals[name])

                differs = traced != baseline
                if differs:
                    mark = "ловится"
                elif reason:
                    mark = "слепая(ожид)"
                    expected_blind.append((name, old, reason))
                else:
                    mark = "НЕ ЛОВИТСЯ"
                    blind.append((name, old))
                print(f"{mark:>13}  {name:<15} {old[:45]}")
        finally:
            for name, blob in originals.items():
                (MODULES / name).write_bytes(blob)
            subprocess.run(
                [sys.executable, "tools/scenarios.py", "build"],
                cwd=ROOT, check=True, capture_output=True,
            )

        restored = build_and_trace(tmp)
        if restored != baseline:
            raise SystemExit("ОШИБКА: после восстановления трасса не совпала с эталоном")
        print("\nмодули восстановлены, трасса совпадает с эталонной")

        if expected_blind:
            print(f"\nосознанные слепые зоны стенда: {len(expected_blind)}")
            for name, old, reason in expected_blind:
                print(f"  {name}: {old}\n    причина: {reason}")

        if blind:
            print(f"\nНЕОЖИДАННО непокрытых мутаций: {len(blind)}", file=sys.stderr)
            for name, old in blind:
                print(f"  {name}: {old}", file=sys.stderr)
            print(
                "либо расширьте сценарий в tools/engine-harness.js, либо занесите "
                "мутацию в MUTATIONS с причиной",
                file=sys.stderr,
            )
            return 1

        covered = len(MUTATIONS) - len(expected_blind)
        print(f"\nтрассу изменили {covered} мутаций из {len(MUTATIONS)}")
        return 0


if __name__ == "__main__":
    sys.exit(main())
