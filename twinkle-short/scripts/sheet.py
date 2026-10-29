"""Tile PNG stills into one review sheet (labels = file names).

    .venv/bin/python scripts/sheet.py out/sheet.png out/stills/*.png
"""
import sys, glob
from PIL import Image, ImageDraw
files = sys.argv[2:]
out = sys.argv[1]
ims = [Image.open(f).convert('RGB') for f in files]
w = 270; h = int(ims[0].height * w / ims[0].width)
cols = min(5, len(ims)); rows = (len(ims) + cols - 1) // cols
sheet = Image.new('RGB', (cols * w, rows * (h + 18)), 'black')
d = ImageDraw.Draw(sheet)
for i, (im, f) in enumerate(zip(ims, files)):
    x, y = (i % cols) * w, (i // cols) * (h + 18)
    sheet.paste(im.resize((w, h)), (x, y + 18))
    d.text((x + 4, y + 2), f.split('/')[-1], fill='white')
sheet.save(out)
