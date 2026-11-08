"""Apply keymap changes to the Cornix over Vial. Usage: apply.py [--restore]

Matrix: rows 0-3 = left half (col 0 = outer pinky), rows 4-7 = right half (col 0 = outer pinky).
"""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from via import Kb
from kc import name

HERE = os.path.dirname(os.path.abspath(__file__))
NO, TRNS = 0x0000, 0x0001
ESC, CAPS, LBRC, RBRC = 0x29, 0x39, 0x2F, 0x30
F = lambda n: 0x3A + n - 1 if n <= 12 else 0x68 + n - 13
PREV, PLAY, NEXT, BRID, BRIU = 0xAC, 0xAE, 0xAB, 0xBE, 0xBD

backup = json.load(open(os.path.join(HERE, 'backups', 'cornix_backup.json')))['keymap']
R, C = 8, 7

if '--restore' in sys.argv:
    target = backup
else:
    target = json.loads(json.dumps(backup))
    L0, L1, L2 = target[0], target[1], target[2]
    # Layer 0: Caps Lock spot -> Esc
    L0[1][0] = ESC
    # ' on base right of L (dead key for accents with US-Intl-PC); \ moves to layer 1 same key
    L0[5][1] = 0x34   # '
    L1[5][1] = 0x31   # \
    # Thumbs: Space on the resting (middle) keys, one-shot mods on the inner tilted keys
    L0[3][4], L0[3][5] = L0[3][5], L0[3][4]   # left:  Space <-> OSM(Cmd+Shift)
    L0[7][4], L0[7][5] = L0[7][5], L0[7][4]   # right: Space <-> OSM(Hyper)
    # Cmd on the outer left thumb (Mac muscle memory); Layer 1 moves to Cmd's old bottom-row spot
    L0[3][2], L0[3][3] = L0[3][3], L0[3][2]
    # Layer 1: no Caps Lock anywhere (too easy to hit by accident); brackets on K / L
    L1[5][3] = LBRC   # K
    L1[5][2] = RBRC   # L
    # Layer 2: F-keys mirror layer-1 numbers; media on right home row
    for i, col in enumerate(range(1, 6)):        # left top row Q..T -> F1..F5
        L2[0][col] = F(1 + i)
    for i, col in enumerate(range(5, 0, -1)):    # right top row Y..P -> F6..F10
        L2[4][col] = F(6 + i)
    L2[4][0] = F(11)   # Bksp spot
    L2[5][0] = F(12)   # Enter spot
    L2[5][4] = PREV    # J
    L2[5][3] = PLAY    # K
    L2[5][2] = NEXT    # L
    L2[6][4] = BRID    # M
    L2[6][3] = BRIU    # ,
    # Unused keys on layers 1-2 -> transparent so mods/thumbs keep working
    for L in (L1, L2):
        for r in range(R):
            for c in range(C):
                if L[r][c] == NO:
                    L[r][c] = TRNS

k = Kb(0xE118, 0x0001)
changed = 0
for l in range(len(target)):
    for r in range(R):
        for c in range(C):
            want = target[l][r][c]
            if k.get_key(l, r, c) != want:
                k.set_key(l, r, c, want)
                got = k.get_key(l, r, c)
                status = 'ok' if got == want else f'FAILED (reads {name(got)})'
                print(f'L{l} ({r},{c}): {name(backup[l][r][c]) or "none"} -> {name(want)}  {status}')
                changed += 1
print(f'{changed} keys written')
