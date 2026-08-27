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


def assemble_modules(slug, read):
    """src/<slug>/ -> текст скрипта сценария.

    before-файлы кладутся вне IIFE, modules — внутрь, затем вызывается entry.
    Файлы вставляются как есть, чтобы номера строк в собранном скрипте
    сдвигались предсказуемо (на длину предыдущих модулей).
    """
    spec = json.loads(read(f"src/{slug}/modules.json").decode("utf-8"))

    def part(name):
        return read(f"src/{slug}/{name}").decode("utf-8").rstrip("\n")

    out = [part(name) for name in spec["before"]]
    out.append(
        f"/* Собрано из src/{slug}/ — правки в этом файле потеряются "
        f"при следующей сборке (tools/scenarios.py build). */"
    )
    out.append(f"var {spec['var']} = (function () {{")
    for name in spec["modules"]:
        out.append(f"// ───────────────────────────  {name}  ───────────────────────────")
        out.append(part(name))
        out.append("")
    out.append(f"return {spec['entry']}();")
    out.append("})();")
    out.extend(part(name) for name in spec["after"])
    return "\n".join(out) + "\n"


def join(export_name, slug, read, layout="file"):
    """src/ -> байты экспорта (с сохранением всех полей, кроме data)."""
    export = json.loads(read(export_name).decode("utf-8"))
    template = export["scenarioTemplate"]

    def src(name):
        return read(f"src/{name}").decode("utf-8")

    if layout == "modules":
        template["data"] = assemble_modules(slug, read)
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
