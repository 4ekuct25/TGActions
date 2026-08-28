#!/usr/bin/env python3
"""Извлечение JS из экспортов сценариев Sprut.hub и обратная сборка.

Источник правды — каталог src/. Корневые *.json — генерируемый артефакт,
который импортируется в хаб. Правки кода делаются в src/, затем `build`.

    tools/scenarios.py extract        # *.json -> src/   (после экспорта из хаба)
    tools/scenarios.py build          # src/   -> *.json (перед импортом в хаб)
    tools/scenarios.py check          # сверка без записи, ненулевой код при расхождении
    tools/scenarios.py check --index  # то же, но по содержимому индекса (pre-commit)

Сборка байт-в-байт: экспорты сериализуются как
json.dumps(obj, ensure_ascii=False, indent=2) без завершающего перевода строки,
вложенный граф BLOCK-сценария — компактно, separators=(',', ':').
Переводы строк внутри кода (в GLOBAL-сценариях это CRLF) сохраняются как есть,
поэтому src/*.js читаются и пишутся в бинарном режиме.

Про --index: коммит фиксирует индекс, а не рабочее дерево. Сверка рабочего дерева
пропустила бы коммит, где правка src/ застейджена, а пересобранный экспорт — нет.
В этом режиме всё содержимое читается через `git show :<путь>`.
"""

import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
MAP = Path(__file__).resolve().parent / "scenarios.json"

CODE_REF = "@file:"


def read_worktree(relpath):
    path = ROOT / relpath
    if not path.is_file():
        raise SystemExit(f"нет файла {relpath} — запустите `tools/scenarios.py extract`")
    return path.read_bytes()


def read_index(relpath):
    done = subprocess.run(
        ["git", "show", f":{relpath}"], cwd=ROOT, capture_output=True
    )
    if done.returncode != 0:
        raise SystemExit(
            f"{relpath}: нет в индексе — файл не отслеживается или не застейджен "
            f"(`git add {relpath}`)"
        )
    return done.stdout


def load_map(read):
    """Список сценариев {export, slug, layout} с проверкой покрытия корня."""
    entries = json.loads(read("tools/scenarios.json").decode("utf-8"))["scenarios"]
    scenarios = []
    for e in entries:
        if not (ROOT / e["export"]).is_file():
            raise SystemExit(f"{MAP.name}: нет файла {e['export']}")
        layout = e.get("layout", "file")
        if layout not in ("file", "modules"):
            raise SystemExit(f"{MAP.name}: неизвестный layout {layout!r} у {e['slug']}")
        scenarios.append({"export": e["export"], "slug": e["slug"], "layout": layout})

    mapped = {s["export"] for s in scenarios}
    unmapped = sorted(p.name for p in ROOT.glob("*.json") if p.name not in mapped)
    if unmapped:
        raise SystemExit(
            f"{MAP.name}: сценарии не заведены в карте: {', '.join(unmapped)}"
        )
    return scenarios


def dump_export(obj):
    return json.dumps(obj, ensure_ascii=False, indent=2).encode("utf-8")


def code_nodes(graph):
    """Узлы графа BLOCK-сценария с полем code, в порядке обхода."""
    found = []

    def walk(node):
        if isinstance(node, dict):
            if isinstance(node.get("code"), str):
                found.append(node)
            for value in node.values():
                walk(value)
        elif isinstance(node, list):
            for value in node:
                walk(value)

    walk(graph)
    return found


def split(export_name, slug, read):
    """Экспорт -> {имя файла в src/: bytes}."""
    template = json.loads(read(export_name).decode("utf-8"))["scenarioTemplate"]
    data = template["data"]

    if template["type"] != "BLOCK":
        return {f"{slug}.js": data.encode("utf-8")}

    graph = json.loads(data)
    files = {}
    for i, node in enumerate(code_nodes(graph), 1):
        name = f"{slug}.code.{i}.js"
        files[name] = node["code"].encode("utf-8")
        node["code"] = CODE_REF + name
    files[f"{slug}.blocks.json"] = (
        json.dumps(graph, ensure_ascii=False, indent=2) + "\n"
    ).encode("utf-8")
    return files


def strip_comments(text):
    """Убирает комментарии, занимающие строку целиком.

    Хаб молча не сохраняет крупные сценарии, а комментарии здесь — больше трети
    объёма. В репозитории остаётся документированный исходник, в хаб уезжает та
    же логика без комментариев.

    Правится только целая строка: строки вида `// …` и блоки `/* … */`,
    начинающиеся со строки. Часть строки не трогается никогда — именно на этом
    ломаются регулярочные «вырезалки», потому что в коде есть литералы вроде
    /^-?\\d+$/ и '//' внутри строк ('https://…'). Хвостовые комментарии
    (`code(); // пояснение`) остаются: их объём мал, а разбор опасен.

    Гарантия даётся не аккуратностью правил, а проверкой: собранный скрипт
    прогоняется через node --check и A/B на tools/engine-harness.js.
    """
    out = []
    in_block = False
    for line in text.split("\n"):
        stripped = line.strip()
        if in_block:
            if "*/" in stripped:
                in_block = False
                # Хвост после закрытия — это код, строку целиком выкинуть нельзя.
                tail = stripped.split("*/", 1)[1].strip()
                if tail:
                    out.append(line)
            continue
        if stripped.startswith("//"):
            continue
        if stripped.startswith("/*"):
            if "*/" in stripped:
                tail = stripped.split("*/", 1)[1].strip()
                if tail:
                    out.append(line)
                continue
            in_block = True
            continue
        out.append(line)

    # Схлопываем подряд идущие пустые строки, оставшиеся от вырезанных блоков.
    result = []
    for line in out:
        if not line.strip() and result and not result[-1].strip():
            continue
        result.append(line)
    return "\n".join(result)


def assemble_modules(slug, read, with_local=False):
    """src/<slug>/ -> текст скрипта сценария.

    before-файлы кладутся вне IIFE, modules — внутрь, затем вызывается entry.
    Файлы вставляются как есть, чтобы номера строк в собранном скрипте
    сдвигались предсказуемо (на длину предыдущих модулей).
    """
    spec = json.loads(read(f"src/{slug}/modules.json").decode("utf-8"))

    def part(name):
        if name == "local.js":
            return (ROOT / "src" / slug / name).read_bytes().decode("utf-8").rstrip("\n")
        return read(f"src/{slug}/{name}").decode("utf-8").rstrip("\n")

    # Комментарии режутся только в коде модулей. before/after (шапка «читайте
    # README» и блок примеров) остаются: их читает человек, открывший сценарий
    # в хабе, и весят они немного.
    strip = bool(spec.get("stripComments"))

    modules = list(spec["modules"])
    # local.js не отслеживается git и подмешивается только в сборку для хаба.
    # Читается всегда с диска, даже в режиме --index: в индексе его нет и быть
    # не должно.
    if with_local and (ROOT / "src" / slug / "local.js").is_file():
        modules.insert(0, "local.js")

    out = [part(name) for name in spec["before"]]
    out.append(
        f"/* Собрано из src/{slug}/ — правки в этом файле потеряются "
        f"при следующей сборке (tools/scenarios.py build). */"
    )
    out.append(f"var {spec['var']} = (function () {{")
    for name in modules:
        out.append(f"// ───────────────────────────  {name}  ───────────────────────────")
        body = part(name)
        out.append(strip_comments(body) if strip else body)
        out.append("")
    out.append(f"return {spec['entry']}();")
    out.append("})();")
    out.extend(part(name) for name in spec["after"])
    return "\n".join(out) + "\n"


def join(export_name, slug, read, layout="file", with_local=False):
    """src/ -> байты экспорта (с сохранением всех полей, кроме data)."""
    export = json.loads(read(export_name).decode("utf-8"))
    template = export["scenarioTemplate"]

    def src(name):
        return read(f"src/{name}").decode("utf-8")

    if layout == "modules":
        template["data"] = assemble_modules(slug, read, with_local)
    elif template["type"] != "BLOCK":
        template["data"] = src(f"{slug}.js")
    else:
        graph = json.loads(src(f"{slug}.blocks.json"))
        for node in code_nodes(graph):
            ref = node["code"]
            if not ref.startswith(CODE_REF):
                raise SystemExit(
                    f"{slug}.blocks.json: ожидалась ссылка «{CODE_REF}…», а не код: {ref[:40]!r}"
                )
            node["code"] = src(ref[len(CODE_REF):])
        template["data"] = json.dumps(graph, ensure_ascii=False, separators=(",", ":"))

    return dump_export(export)


def cmd_extract(_args):
    SRC.mkdir(exist_ok=True)
    written = []
    skipped = []
    for s in load_map(read_worktree):
        if s["layout"] == "modules":
            # Обратное разложение экспорта по модулям не автоматизируется:
            # хаб отдаёт собранный скрипт одним куском. Перенос правок,
            # сделанных в хабе, в src/<slug>/ — ручная работа.
            skipped.append(s["export"])
            continue
        for name, blob in split(s["export"], s["slug"], read_worktree).items():
            (SRC / name).write_bytes(blob)
            written.append(name)
    print(f"извлечено в src/: {', '.join(sorted(written))}")
    if skipped:
        print(
            "ПРОПУЩЕНО (layout=modules, разложить по модулям вручную): "
            + ", ".join(skipped),
            file=sys.stderr,
        )
    return 0


def cmd_build(args):
    if getattr(args, "local", False):
        return build_local()

    read = read_index if getattr(args, "index", False) else read_worktree
    where = "индексе" if read is read_index else "рабочем дереве"

    changed = []
    for s in load_map(read):
        built = join(s["export"], s["slug"], read, s["layout"])
        if built == read(s["export"]):
            continue
        changed.append(s["export"])
        if not args.check:
            (ROOT / s["export"]).write_bytes(built)

    if args.check:
        if changed:
            print(
                f"в {where} экспорты расходятся с src/: " + ", ".join(changed),
                file=sys.stderr,
            )
            print(
                "пересоберите и застейджите: python3 tools/scenarios.py build",
                file=sys.stderr,
            )
            return 1
        print(f"все экспорты в {where} соответствуют src/")
        return 0

    print("обновлено: " + (", ".join(changed) if changed else "нечего — всё совпадает"))
    report_sizes(read)
    return 0


# Потолок из прошлых проектов по этому же хабу: 61 КБ сценарий уже не доезжает,
# заведомо доезжали сборки до ~47 КБ. Хаб при этом гасит значок «сохранить»,
# как будто всё прошло, поэтому предупреждать надо заранее.
HUB_SIZE_WARN = 47000


DIST = ROOT / "dist"


def build_local():
    """Сборка для импорта в хаб: с подставленными секретами, в dist/.

    Отслеживаемые экспорты в корне при этом НЕ трогаются — они остаются с
    плейсхолдерами. Иначе токен уехал бы в публичную историю репозитория.
    """
    DIST.mkdir(exist_ok=True)
    written = []
    missing = []
    for s in load_map(read_worktree):
        has_local = (SRC / s["slug"] / "local.js").is_file()
        if s["layout"] == "modules" and not has_local and (SRC / s["slug"] / "local.example.js").is_file():
            missing.append(s["slug"])
        built = join(s["export"], s["slug"], read_worktree, s["layout"], with_local=True)
        (DIST / s["export"]).write_bytes(built)
        written.append(s["export"])

    print("собрано в dist/ (импортировать в хаб именно это):")
    for name in written:
        size = len((DIST / name).read_bytes())
        print(f"  {size:>7} байт  {name}")

    if missing:
        print(
            "\nВНИМАНИЕ: нет src/" + "/local.js, нет src/".join(missing) + "/local.js — "
            "сборка ушла с плейсхолдерами.\n"
            "Скопируйте образец: cp src/02-settings/local.example.js src/02-settings/local.js",
            file=sys.stderr,
        )
        return 1

    # Предупреждаем, если в сборке для хаба остались незаполненные значения:
    # молча уехавший плейсхолдер выглядит как рабочая конфигурация.
    leaked = [
        n for n in written
        if "Заполнить" in (DIST / n).read_text(encoding="utf-8")
    ]
    if leaked:
        print("\nв сборке остались плейсхолдеры «Заполнить»: " + ", ".join(leaked),
              file=sys.stderr)
        print("это нормально, пока не известен id семейной группы — узнать: /who в группе",
              file=sys.stderr)
    return 0


def report_sizes(read):
    print("размер data (потолок хаба ~47 КБ, выше сценарий может молча не сохраниться):")
    for s in load_map(read):
        data = json.loads(read(s["export"]).decode("utf-8"))["scenarioTemplate"]["data"]
        size = len(data.encode("utf-8"))
        pct = size / HUB_SIZE_WARN * 100
        flag = "  ← БЛИЗКО К ПОТОЛКУ" if pct >= 80 else ""
        print(f"  {size:>7} байт  {pct:>5.0f}%  {s['export']}{flag}")


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("extract", help="*.json -> src/").set_defaults(
        func=cmd_extract, check=False
    )
    build = sub.add_parser("build", help="src/ -> *.json")
    build.add_argument(
        "--local",
        action="store_true",
        help="собрать для хаба с секретами из local.js в dist/ (в git не попадает)",
    )
    build.set_defaults(func=cmd_build, check=False)
    check = sub.add_parser("check", help="сверить *.json с src/ без записи")
    check.add_argument(
        "--index",
        action="store_true",
        help="сверять содержимое индекса, а не рабочего дерева (режим pre-commit)",
    )
    check.set_defaults(func=cmd_build, check=True)
    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
