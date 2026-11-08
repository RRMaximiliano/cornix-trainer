"""QMK v6 (0.19+) keycode names, enough for display."""
BASIC = {0x00: '', 0x01: '▽', 0x28: 'Enter', 0x29: 'Esc', 0x2A: 'Bksp', 0x2B: 'Tab', 0x2C: 'Space',
         0x2D: '-', 0x2E: '=', 0x2F: '[', 0x30: ']', 0x31: '\\', 0x32: 'NUHS', 0x33: ';', 0x34: "'",
         0x35: '`', 0x36: ',', 0x37: '.', 0x38: '/', 0x39: 'Caps', 0x46: 'PrtSc', 0x47: 'ScrLk',
         0x48: 'Pause', 0x49: 'Ins', 0x4A: 'Home', 0x4B: 'PgUp', 0x4C: 'Del', 0x4D: 'End', 0x4E: 'PgDn',
         0x4F: 'Right', 0x50: 'Left', 0x51: 'Down', 0x52: 'Up', 0x53: 'NumLk', 0x65: 'Menu',
         0xA5: 'Power', 0xA6: 'Sleep', 0xA7: 'Wake', 0xA8: 'Mute', 0xA9: 'Vol+', 0xAA: 'Vol-',
         0xAB: 'Next', 0xAC: 'Prev', 0xAD: 'Stop', 0xAE: 'Play', 0xAF: 'MSel', 0xB0: 'Eject',
         0xB1: 'Mail', 0xB2: 'Calc', 0xB3: 'MyComp', 0xB4: 'WSearch', 0xBD: 'Bri+', 0xBE: 'Bri-',
         0xC1: 'MissionCtl', 0xC2: 'Launchpad',
         0xCD: 'MsUp', 0xCE: 'MsDown', 0xCF: 'MsLeft', 0xD0: 'MsRight',
         0xD9: 'WhUp', 0xDA: 'WhDown', 0xDB: 'WhLeft', 0xDC: 'WhRight',
         0xE0: 'LCtrl', 0xE1: 'LShift', 0xE2: 'LAlt', 0xE3: 'LGui',
         0xE4: 'RCtrl', 0xE5: 'RShift', 0xE6: 'RAlt', 0xE7: 'RGui'}
for i in range(26):
    BASIC[0x04 + i] = chr(ord('A') + i)
for i in range(9):
    BASIC[0x1E + i] = str(i + 1)
BASIC[0x27] = '0'
for i in range(12):
    BASIC[0x3A + i] = f'F{i+1}'
    BASIC[0x68 + i] = f'F{i+13}'
for i in range(8):
    BASIC[0xD1 + i] = f'Mouse{i+1}'
for i in range(10):
    BASIC[0x59 + i] = f'KP{(i+1) % 10}'


def mods5(m):
    r = 'R' if m & 0x10 else 'L'
    s = ''.join(n for b, n in ((1, 'C'), (2, 'S'), (4, 'A'), (8, 'G')) if m & b)
    if (m & 0xF) == 0xF:
        return r + 'Hyper'
    if (m & 0xF) == 0x7:
        return r + 'Meh'
    return r + s


def name(k):
    if k <= 0xFF:
        return BASIC.get(k, f'0x{k:02X}')
    if k < 0x2000:
        return f'{mods5(k >> 8)}({name(k & 0xFF)})'
    if k < 0x4000:
        return f'{mods5((k >> 8) & 0x1F)}_T({name(k & 0xFF)})'
    if k < 0x5000:
        return f'LT{(k >> 8) & 0xF}({name(k & 0xFF)})'
    if k < 0x5200:
        return f'LM{(k >> 5) & 0xF}({mods5(k & 0x1F)})'
    ranges = [(0x5200, 'TO'), (0x5220, 'MO'), (0x5240, 'DF'), (0x5260, 'TG'), (0x5280, 'OSL'),
              (0x52C0, 'TT'), (0x52E0, 'PDF')]
    for base, n in ranges:
        if base <= k < base + 0x20:
            return f'{n}({k - base})'
    if 0x52A0 <= k < 0x52C0:
        return f'OSM({mods5(k - 0x52A0)})'
    if 0x5700 <= k < 0x5800:
        return f'TD({k - 0x5700})'
    if 0x7700 <= k < 0x7780:
        return f'M{k - 0x7700}'
    if 0x7E00 <= k < 0x7E40:
        return f'KB{k - 0x7E00}'
    if 0x7E40 <= k < 0x7F00:
        return f'USER{k - 0x7E40}'
    return f'0x{k:04X}'
