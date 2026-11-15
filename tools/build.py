#!/usr/bin/env python3
"""Packages the add-on for import into Minecraft Bedrock / MCPE.

    python3 tools/build.py

Writes to dist/:
    ElementalRelics.mcaddon      both packs in one file (open this one)
    ElementalRelics_BP.mcpack    behavior pack on its own
    ElementalRelics_RP.mcpack    resource pack on its own
"""
import json
import os
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, "dist")
PACKS = {
    "ElementalRelics_BP": os.path.join(ROOT, "behavior_pack"),
    "ElementalRelics_RP": os.path.join(ROOT, "resource_pack"),
}
# fixed timestamp => identical input gives a byte-identical archive
STAMP = (2026, 1, 1, 0, 0, 0)


def pack_files(folder):
    for base, dirs, files in os.walk(folder):
        dirs.sort()
        for name in sorted(files):
            if name.startswith("."):
                continue
            path = os.path.join(base, name)
            yield path, os.path.relpath(path, folder).replace(os.sep, "/")


def check_json(folder):
    """Every .json must parse - a single stray comma silently breaks a pack."""
    for path, rel in pack_files(folder):
        if rel.endswith(".json"):
            with open(path, encoding="utf-8") as fh:
                try:
                    json.load(fh)
                except ValueError as error:
                    raise SystemExit(f"{rel}: invalid JSON: {error}")


def add(archive, path, arcname):
    info = zipfile.ZipInfo(arcname, date_time=STAMP)
    info.compress_type = zipfile.ZIP_DEFLATED
    info.external_attr = 0o644 << 16
    with open(path, "rb") as fh:
        archive.writestr(info, fh.read())


def main():
    os.makedirs(DIST, exist_ok=True)
    for folder in PACKS.values():
        check_json(folder)

    addon_path = os.path.join(DIST, "ElementalRelics.mcaddon")
    with zipfile.ZipFile(addon_path, "w") as addon:
        for name, folder in PACKS.items():
            pack_path = os.path.join(DIST, name + ".mcpack")
            with zipfile.ZipFile(pack_path, "w") as pack:
                for path, rel in pack_files(folder):
                    add(pack, path, rel)
                    add(addon, path, f"{name}/{rel}")
            print(f"{os.path.relpath(pack_path, ROOT)}  {os.path.getsize(pack_path):,} bytes")
    print(f"{os.path.relpath(addon_path, ROOT)}  {os.path.getsize(addon_path):,} bytes")


if __name__ == "__main__":
    main()
