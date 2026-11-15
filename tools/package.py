#!/usr/bin/env python3
"""Zips both packs into dist/VenomMode.mcaddon, the file Minecraft imports.

Usage:  python3 tools/package.py
"""
import os
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PACKS = {
    "VenomMode_BP": os.path.join(ROOT, "behavior_packs", "venom_mode_bp"),
    "VenomMode_RP": os.path.join(ROOT, "resource_packs", "venom_mode_rp"),
}
OUT = os.path.join(ROOT, "dist", "VenomMode.mcaddon")
EPOCH = (2026, 1, 1, 0, 0, 0)  # fixed timestamps: the same sources always give the same file


def main():
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    count = 0
    with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as archive:
        for folder, source in PACKS.items():
            for directory, subdirs, files in os.walk(source):
                subdirs.sort()
                for name in sorted(files):
                    path = os.path.join(directory, name)
                    arcname = f"{folder}/{os.path.relpath(path, source)}".replace(os.sep, "/")
                    info = zipfile.ZipInfo(arcname, EPOCH)
                    info.compress_type = zipfile.ZIP_DEFLATED
                    info.external_attr = 0o644 << 16
                    with open(path, "rb") as f:
                        archive.writestr(info, f.read())
                    count += 1
    print(f"{os.path.relpath(OUT, ROOT)}: {count} files, {os.path.getsize(OUT) // 1024} KB")


if __name__ == "__main__":
    main()
