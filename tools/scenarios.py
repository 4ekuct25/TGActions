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
    """Список (export_name, slug) с проверкой, что карта покрывает корень."""
    entries = json.loads(read("tools/scenarios.json").decode("utf-8"))["scenarios"]
    mapped = {}
    for e in entries:
        if not (ROOT / e["export"]).is_file():
            raise SystemExit(f"{MAP.name}: нет файла {e['export']}")
        mapped[e["export"]] = e["slug"]

    unmapped = sorted(p.name for p in ROOT.glob("*.json") if p.name not in mapped)
    if unmapped:
        raise SystemExit(
            f"{MAP.name}: сценарии не заведены в карте: {', '.join(unmapped)}"
        )
    return list(mapped.items())


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


def join(export_name, slug, read):
    """src/ -> байты экспорта (с сохранением всех полей, кроме data)."""
    export = json.loads(read(export_name).decode("utf-8"))
    template = export["scenarioTemplate"]

    def src(name):
        return read(f"src/{name}").decode("utf-8")

    if template["type"] != "BLOCK":
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
    for export_name, slug in load_map(read_worktree):
        for name, blob in split(export_name, slug, read_worktree).items():
            (SRC / name).write_bytes(blob)
            written.append(name)
    print(f"извлечено в src/: {', '.join(sorted(written))}")
    return 0


def cmd_build(args):
    read = read_index if getattr(args, "index", False) else read_worktree
    where = "индексе" if read is read_index else "рабочем дереве"

    changed = []
    for export_name, slug in load_map(read):
        built = join(export_name, slug, read)
        if built == read(export_name):
            continue
        changed.append(export_name)
        if not args.check:
            (ROOT / export_name).write_bytes(built)

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
    return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("extract", help="*.json -> src/").set_defaults(
        func=cmd_extract, check=False
    )
    sub.add_parser("build", help="src/ -> *.json").set_defaults(
        func=cmd_build, check=False
    )
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
