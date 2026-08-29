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
SETTINGS = ROOT / "src" / "02-settings"

# Мутации сценария настроек. Здесь эталон не трасса, а вердикт
# tools/settings-harness.js: сломанная политика доступа обязана его завалить.
# Если мутация проходит зелёной — стенд не проверяет то, ради чего написан.
SETTINGS_MUTATIONS = [
    ("access.js", "if (!user) {", "if (false) {",
     "неизвестный человек допущен"),
    ("access.js", "if (item.critical && !(profile.allowCritical && user.critical)) {",
     "if (false) {", "снята проверка критичных действий"),
    ("access.js", "if (profile.rooms[i] === '*' || profile.rooms[i] === roomName) {",
     "if (true) {", "комнаты профиля игнорируются"),
    ("menu.js", "if (item.critical && !profile.allowCritical) {", "if (false) {",
     "критичное попадает в семейное меню"),
    ("discovery.js", "if (hidden.isRoomHidden(roomName)) {", "if (true && false) {",
     "чёрный список комнат не работает"),
    ("discovery.js", "if (hidden.isAccessoryHidden(String(accs[a].getName()))) {",
     "if (true && false) {", "чёрный список аксессуаров не работает"),
    ("discovery.js", "rooms: hidden.sortNames(roomNames),", "rooms: roomNames,",
     "комнаты не сортируются по алфавиту"),
    ("commands.js", "var list = byRoom[room].slice().sort(byTitle);",
     "var list = byRoom[room];", "датчики в /status не сортируются"),
    ("menu.js", "return { map: map, order: sortNames(order) };",
     "return { map: map, order: order };", "устройства в комнате не сортируются"),
    ("menu.js", "map[name].sort(byTitle);", "map[name];",
     "действия внутри устройства не сортируются"),
    ("discovery.js", "if (override.hide) {", "if (false) {",
     "точечное скрытие устройства не работает"),
    ("discovery.js", "return Hub.getCharacteristicValue(item.aId, item.cId);",
     "return null;", "чтение значений сломано"),
    # Подстановка секретов из local.js: без неё бот молчит во всех чатах.
    ("access.js", "profiles[i].chatId = local.chats[profiles[i].key];",
     "profiles[i].chatId = profiles[i].chatId;", "chatId из local.js не подставляется"),
    ("access.js", "users = local.users;", "users = users;",
     "белый список из local.js не подставляется"),
]

# (файл, что заменить, на что[, причина-почему-заведомо-не-ловится])
#
# Четвёртый элемент = осознанно принятая слепая зона: мутация трассу не меняет,
# и это ожидаемо. Такие не роняют скрипт, но печатаются — чтобы список слепых
# зон был виден, а не растворялся в «всё зелено».
MUTATIONS = [
    ("polling.js", "backoff > 60000", "backoff > 70000"),
    # Без проверки поколения прежние экземпляры движка продолжают опрос и
    # дерутся за getUpdates одного бота.
    ("polling.js", "if (!isCurrentEpoch()) {", "if (false) {"),
    # getBot должен быть ВНУТРИ try: снаружи его ошибка обрывала цепочку опроса
    # навсегда, и бот молча замолкал.
    ("polling.js", "            bot = getBot(botName);",
     "            bot = getBot(botName + 'X');"),
    (
        "polling.js",
        "inFlight[botName] = true;",
        "inFlight[botName] = false;",
        "защита от повторного входа в pollOnce: срабатывает, только если таймер "
        "сработал до возврата предыдущего long-poll. В стенде HTTP синхронный и "
        "поток один, через публичный API ветка недостижима",
    ),
    # Белый список чатов должен читаться в момент проверки, а не кэшироваться:
    # иначе переимпорт настроек оставляет его устаревшим и бот молчит.
    (
        "state.js",
        "if (settings.chats.hasOwnProperty(k) && String(settings.chats[k]) === needle) {",
        "if (settings.chats.hasOwnProperty(k) && String(k) === needle) {",
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
    # Разворот алиасов _default: без него null-аргументы дают /botundefined/…
    # и chat_id='chatName1' (см. шаги «…(null, null)» в стенде).
    (
        "helpers.js",
        "var key = (name === null || name === undefined) ? bots._default : name;",
        "var key = name;",
    ),
    (
        "helpers.js",
        "var key = (name === null || name === undefined) ? chats._default : name;",
        "var key = name;",
    ),
    # Значения описаний по умолчанию из настроек и защита от пустой строки.
    (
        "bot-meta.js",
        "bot.description || settings.botDescription",
        "bot.description",
    ),
    (
        "bot-meta.js",
        "if (shortDescription) {",
        "if (true) {",
    ),
    ("commands.js", "if (commandsRegistered[botName]) {", "if (false) {"),
    # Без botName обработчик кнопки не может ответить в тот же чат.
    ("handlers.js", "cq.botName = botName;", "cq.botName = null;"),
    # Без anyChat команда /who недоступна в ещё не настроенной группе —
    # то есть ровно там, где она нужна.
    ("handlers.js", "if (!_isAllowedChat(msg.chat.id) && !(cmd && cmd.anyChat)) {",
     "if (!_isAllowedChat(msg.chat.id)) {"),
    ("updates.js", "pollOffsets[botName] = maxId + 1;", "pollOffsets[botName] = maxId;"),
    # Формат строки журнала должен совпадать с прежним (сценарий Logger):
    # «Info: TGActions#версия, текст». Иначе поедет привычный вид журнала.
    (
        "logger.js",
        "return level + ': ' + name + ', ' + render(args);",
        "return render(args);",
    ),
    (
        "logger.js",
        "name = 'TGActions' + ver;",
        "name = 'TGActions';",
    ),
    # Подстановка {} по правилам прежнего Logger.
    (
        "logger.js",
        "out += (i < rest.length) ? rest[i] : '{}';",
        "out += rest[i];",
        "ветка «плейсхолдеров {} больше, чем аргументов». Все вызовы логгера "
        "в движке сбалансированы, поэтому через публичный API она недостижима; "
        "оставлена как защита при будущих правках форматных строк",
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


def settings_harness_passes():
    """True, если стенд настроек доволен текущей сборкой."""
    subprocess.run([sys.executable, "tools/scenarios.py", "build"],
                   cwd=ROOT, check=True, capture_output=True)
    done = subprocess.run(["node", "tools/settings-harness.js"],
                          cwd=ROOT, capture_output=True, text=True)
    return done.returncode == 0


def check_settings():
    """Каждая мутация политики доступа обязана завалить стенд настроек."""
    print("\n=== сценарий настроек: мутации политики доступа ===")
    originals = {p.name: p.read_bytes() for p in SETTINGS.glob("*.js")}
    missed = []
    try:
        if not settings_harness_passes():
            raise SystemExit("стенд настроек не проходит ДО мутаций — чинить надо его")
        for name, old, new, title in SETTINGS_MUTATIONS:
            path = SETTINGS / name
            text = path.read_text(encoding="utf-8")
            if text.count(old) != 1:
                raise SystemExit(
                    f"{name}: паттерн {old!r} встречается {text.count(old)} раз"
                )
            path.write_text(text.replace(old, new), encoding="utf-8")
            try:
                caught = not settings_harness_passes()
            finally:
                path.write_bytes(originals[name])
            print(f"{'ловится' if caught else 'НЕ ЛОВИТСЯ':>10}  {name:<14} {title}")
            if not caught:
                missed.append(f"{name}: {title}")
    finally:
        for name, blob in originals.items():
            (SETTINGS / name).write_bytes(blob)
        subprocess.run([sys.executable, "tools/scenarios.py", "build"],
                       cwd=ROOT, check=True, capture_output=True)

    if not settings_harness_passes():
        raise SystemExit("после восстановления стенд настроек не проходит")
    return missed


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

    missed = check_settings()
    if missed:
        print(f"\nстенд настроек НЕ ловит {len(missed)}:", file=sys.stderr)
        for m in missed:
            print("  " + m, file=sys.stderr)
        return 1
    print(f"стенд настроек ловит все {len(SETTINGS_MUTATIONS)} мутаций")
    return 0


if __name__ == "__main__":
    sys.exit(main())
