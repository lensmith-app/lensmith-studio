"""Lensmith filter tools.

    python lensmith_cli.py check  <folder>
    python lensmith_cli.py pack   <folder> [out.lensmith]
    python lensmith_cli.py unpack <file.lensmith> <folder>

A filter folder holds filter.json and an optional assets/ folder (png, webp, jpg).
"""

from __future__ import annotations

import argparse
import json
import sys
import zipfile
from pathlib import Path

FORMAT_VERSION = 2
ALLOWED_ASSETS = {".png", ".webp", ".jpg", ".jpeg"}
MAX_FILES = 200
MAX_BYTES = 20 * 1024 * 1024
MAX_IMAGE_SIDE = 2048


def image_references(node) -> list[str]:
    if isinstance(node, dict):
        return [v for k, v in node.items() if k == "image" and isinstance(v, str)] + \
            [r for k, v in node.items() if k != "image" for r in image_references(v)]
    if isinstance(node, list):
        return [r for item in node for r in image_references(item)]
    return []


def check(folder: Path) -> list[str]:
    errors = []
    manifest = folder / "filter.json"
    try:
        data = json.loads(manifest.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return [f"{manifest}: missing"]
    except json.JSONDecodeError as e:
        return [f"{manifest}: not valid JSON ({e})"]

    name = data.get("name")
    if not isinstance(name, str) or not 1 <= len(name.strip()) <= 24:
        errors.append("name must be 1-24 characters")
    if not data.get("id"):
        errors.append("id is required")
    if data.get("formatVersion", 1) > FORMAT_VERSION:
        errors.append(f"formatVersion is newer than this tool understands ({FORMAT_VERSION})")

    for ref in image_references(data):
        target = (folder / ref).resolve()
        if not ref.startswith("assets/") or folder.resolve() not in target.parents:
            errors.append(f"picture '{ref}' must be inside assets/")
        elif not target.exists():
            errors.append(f"picture '{ref}' is missing")

    files = [p for p in folder.rglob("*") if p.is_file()]
    if len(files) > MAX_FILES:
        errors.append(f"more than {MAX_FILES} files")
    if sum(p.stat().st_size for p in files) > MAX_BYTES:
        errors.append("larger than 20 MB")
    for p in (folder / "assets").glob("*") if (folder / "assets").exists() else []:
        if p.suffix.lower() not in ALLOWED_ASSETS:
            errors.append(f"assets/{p.name}: only png, webp and jpg are allowed")
            continue
        try:
            from PIL import Image

            with Image.open(p) as img:
                if max(img.size) > MAX_IMAGE_SIDE:
                    errors.append(f"assets/{p.name}: bigger than {MAX_IMAGE_SIDE}px")
        except ImportError:
            pass  # pillow not installed: skip picture size checks
        except Exception:
            errors.append(f"assets/{p.name}: not a readable picture")
    return errors


def pack(folder: Path, out: Path) -> None:
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        z.write(folder / "filter.json", "filter.json")
        for p in sorted((folder / "assets").glob("*")) if (folder / "assets").exists() else []:
            if p.is_file():
                z.write(p, f"assets/{p.name}")


def unpack(package: Path, out: Path) -> None:
    out.mkdir(parents=True, exist_ok=True)
    root = out.resolve()
    with zipfile.ZipFile(package) as z:
        for info in z.infolist():
            if info.is_dir():
                continue
            target = (out / info.filename).resolve()
            if root not in target.parents:
                raise ValueError(f"unsafe path in package: {info.filename}")
            ok = info.filename == "filter.json" or (
                info.filename.startswith("assets/") and Path(info.filename).suffix.lower() in ALLOWED_ASSETS
            )
            if not ok:
                raise ValueError(f"unexpected file in package: {info.filename}")
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(z.read(info))


def main() -> int:
    parser = argparse.ArgumentParser(description="Lensmith filter tools")
    sub = parser.add_subparsers(dest="command", required=True)
    c = sub.add_parser("check", help="check a filter folder")
    c.add_argument("folder", type=Path)
    p = sub.add_parser("pack", help="folder -> .lensmith")
    p.add_argument("folder", type=Path)
    p.add_argument("out", type=Path, nargs="?")
    u = sub.add_parser("unpack", help=".lensmith -> folder")
    u.add_argument("package", type=Path)
    u.add_argument("out", type=Path)
    args = parser.parse_args()

    if args.command in ("check", "pack"):
        errors = check(args.folder)
        for e in errors:
            print(f"  x {e}")
        if errors:
            return 1
        if args.command == "check":
            print("ok: filter looks good")
            return 0
        out = args.out or args.folder.with_suffix(".lensmith")
        pack(args.folder, out)
        print(f"packed -> {out}")
        return 0

    unpack(args.package, args.out)
    print(f"unpacked -> {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
