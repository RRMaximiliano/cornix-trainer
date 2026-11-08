"""Read the Cornix keymap + physical layout over Vial and write app/public/keymap.json.

Usage: tools/.venv/bin/python -I tools/export_keymap.py
"""
import datetime, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from via import Kb

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'app', 'public', 'keymap.json')

k = Kb(0xE118, 0x0001)
definition = k.vial_definition()
rows, cols = definition['matrix']['rows'], definition['matrix']['cols']
layer_count = k.layer_count()
buf = k.get_buffer(rows * cols * layer_count * 2)
layers = [[[(buf[((l * rows + r) * cols + c) * 2] << 8) | buf[((l * rows + r) * cols + c) * 2 + 1]
            for c in range(cols)] for r in range(rows)] for l in range(layer_count)]

json.dump({
    'name': definition.get('name', 'Cornix'),
    'exportedAt': datetime.datetime.now().isoformat(timespec='seconds'),
    'matrix': {'rows': rows, 'cols': cols},
    'layout': definition['layouts']['keymap'],
    'layers': layers,
}, open(OUT, 'w'))
print(f'wrote {os.path.normpath(OUT)}: {layer_count} layers, {rows}x{cols}')
