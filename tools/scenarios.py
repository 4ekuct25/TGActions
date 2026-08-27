#!/usr/bin/env python3
"""Извлечение JS из экспортов сценариев Sprut.hub и обратная сборка.

Источник правды — каталог src/. Корневые *.json — генерируемый артефакт,
который импортируется в хаб. Правки кода делаются в src/, затем `build`.

    tools/scenarios.py extract   # *.json -> src/   (после экспорта из хаба)
    tools/scenarios.py build     # src/   -> *.json (перед импортом в хаб)
    tools/scenarios.py check     # сверка без записи, ненулевой код при расхождении

Сборка байт-в-байт: экспорты сериализуются как
json.dumps(obj, ensure_ascii=False, indent=2) без завершающего перевода строки,
вложенный граф BLOCK-сценария — компактно, separators=(',', ':').
Переводы строк внутри кода (в GLOBAL-сценариях это CRLF) сохраняются как есть,
поэтому src/*.js читаются и пишутся в бинарном режиме.
"""

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
MAP = Path(__file__).resolve().parent / "scenarios.json"

CODE_REF = "@file:"


def load_map():
    """Список (export_path, slug) с проверкой, что карта покрывает корень."""
    entries = json.loads(MAP.read_text(encoding="utf-8"))["scenarios"]
    mapped = {}
    for e in entries:
        path = ROOT / e["export"]
        if not path.is_file():
            raise SystemExit(f"{MAP.name}: нет файла {e['export']}")
        mapped[e["export"]] = e["slug"]

    unmapped = sorted(p.name for p in ROOT.glob("*.json") if p.name not in mapped)
    if unmapped:
        raise SystemExit(
            f"{MAP.name}: сценарии не заведены в карте: {', '.join(unmapped)}"
        )
    return [(ROOT / name, slug) for name, slug in mapped.items()]


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


def split(export_path, slug):
    """Экспорт -> {относительный путь в src: bytes}."""
    template = json.loads(export_path.read_text(encoding="utf-8"))["scenarioTemplate"]
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


def join(export_path, slug):
    """src/ -> байты экспорта (с сохранением всех полей, кроме data)."""
    export = json.loads(export_path.read_text(encoding="utf-8"))
    template = export["scenarioTemplate"]

    if template["type"] != "BLOCK":
        template["data"] = read_src(f"{slug}.js")
    else:
        graph = json.loads(read_src(f"{slug}.blocks.json"))
        for node in code_nodes(graph):
            ref = node["code"]
            if not ref.startswith(CODE_REF):
                raise SystemExit(
                    f"{slug}.blocks.json: ожидалась ссылка «{CODE_REF}…», а не код: {ref[:40]!r}"
                )
            node["code"] = read_src(ref[len(CODE_REF):])
        template["data"] = json.dumps(graph, ensure_ascii=False, separators=(",", ":"))

    return dump_export(export)


def read_src(name):
    path = SRC / name
    if not path.is_file():
        raise SystemExit(f"нет файла src/{name} — запустите `tools/scenarios.py extract`")
    return path.read_bytes().decode("utf-8")


def cmd_extract(_args):
    SRC.mkdir(exist_ok=True)
    written = []
    for export_path, slug in load_map():
        for name, blob in split(export_path, slug).items():
            (SRC / name).write_bytes(blob)
            written.append(name)
    print(f"извлечено в src/: {', '.join(sorted(written))}")
    return 0


def cmd_build(args):
    changed = []
    for export_path, slug in load_map():
        built = join(export_path, slug)
        if built == export_path.read_bytes():
            continue
        changed.append(export_path.name)
        if not args.check:
            export_path.write_bytes(built)

    if args.check:
        if changed:
            print("расходятся с src/: " + ", ".join(changed), file=sys.stderr)
            return 1
        print("все экспорты соответствуют src/")
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
    sub.add_parser("check", help="сверить *.json с src/ без записи").set_defaults(
        func=cmd_build, check=True
    )
    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
