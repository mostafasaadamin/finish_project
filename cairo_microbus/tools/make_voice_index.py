#!/usr/bin/env python3
"""Write assets/voices/index.json mapping line ids to recorded files (run after adding recordings)."""
import json, os

D = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'voices')
os.makedirs(D, exist_ok=True)
files = {}
for f in sorted(os.listdir(D)):
    stem, ext = os.path.splitext(f)
    if ext.lower() in ('.mp3', '.m4a', '.ogg', '.webm', '.wav', '.aac') and stem.startswith('l'):
        files[stem] = f
with open(os.path.join(D, 'index.json'), 'w') as fh:
    json.dump({'files': files}, fh, indent=1)
print(len(files), 'recorded lines')
