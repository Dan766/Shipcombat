#!/usr/bin/env python3
"""Inline the shared fonts + renderer sources into each mockup page."""
import pathlib

BASE = pathlib.Path(__file__).resolve().parent
FONTS = BASE.parent / 'fonts' / 'fontfaces.css'

PARTS = {
    '__FONTFACES__': FONTS,
    '__LOWPOLY3D_JS__': BASE / 'lowpoly3d.js',
    '__SHIPS_JS__': BASE / 'ships.js',
    '__SHIPCLASSES_JS__': BASE / 'shipclasses.js',
    '__WEATHER_JS__': BASE / 'weather.js',
    '__SCENES_JS__': BASE / 'scenes.js',
}

for name in ('moodboard', 'hud', 'classes', 'weather', 'controls'):
    src = BASE / (name + '.src.html')
    if not src.exists():
        continue
    out = src.read_text()
    for token, path in PARTS.items():
        if token in out:
            out = out.replace(token, path.read_text())
    dest = BASE / (name + '.html')
    dest.write_text(out)
    print('%-14s %8d bytes' % (dest.name, len(out)))
