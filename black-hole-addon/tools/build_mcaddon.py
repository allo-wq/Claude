#!/usr/bin/env python3
"""Package the behavior + resource packs into dist/BlackHole.mcaddon.

A .mcaddon is just a zip that contains the two pack folders at its root
(each with its own manifest.json). Double-clicking it imports both packs
into Minecraft Bedrock.
"""

import os
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PACKS = os.path.join(ROOT, "packs")
DIST = os.path.join(ROOT, "dist")
OUT = os.path.join(DIST, "BlackHole.mcaddon")

os.makedirs(DIST, exist_ok=True)

with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as z:
    for pack in ("BlackHoleBP", "BlackHoleRP"):
        base = os.path.join(PACKS, pack)
        for dirpath, _, files in os.walk(base):
            for name in sorted(files):
                full = os.path.join(dirpath, name)
                arc = os.path.relpath(full, PACKS)
                z.write(full, arc)
                print("  +", arc)

print("\nbuilt", os.path.relpath(OUT, ROOT), f"({os.path.getsize(OUT)} bytes)")
