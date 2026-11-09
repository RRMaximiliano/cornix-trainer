// QMK v6 keycodes (what Vial protocol 6 uses), limited to what this trainer needs.

export const KC_NO = 0x0000
export const KC_TRNS = 0x0001

/** HID usage -> KeyboardEvent.code */
const CODE: Record<number, string> = {
  0x28: 'Enter', 0x29: 'Escape', 0x2a: 'Backspace', 0x2b: 'Tab', 0x2c: 'Space',
  0x2d: 'Minus', 0x2e: 'Equal', 0x2f: 'BracketLeft', 0x30: 'BracketRight', 0x31: 'Backslash',
  0x33: 'Semicolon', 0x34: 'Quote', 0x35: 'Backquote', 0x36: 'Comma', 0x37: 'Period',
  0x38: 'Slash', 0x39: 'CapsLock', 0x46: 'PrintScreen', 0x49: 'Insert', 0x4a: 'Home',
  0x4b: 'PageUp', 0x4c: 'Delete', 0x4d: 'End', 0x4e: 'PageDown', 0x4f: 'ArrowRight',
  0x50: 'ArrowLeft', 0x51: 'ArrowDown', 0x52: 'ArrowUp', 0x64: 'IntlBackslash',
  0xe0: 'ControlLeft', 0xe1: 'ShiftLeft', 0xe2: 'AltLeft', 0xe3: 'MetaLeft',
  0xe4: 'ControlRight', 0xe5: 'ShiftRight', 0xe6: 'AltRight', 0xe7: 'MetaRight',
}
for (let i = 0; i < 26; i++) CODE[0x04 + i] = 'Key' + String.fromCharCode(65 + i)
for (let i = 0; i < 9; i++) CODE[0x1e + i] = 'Digit' + (i + 1)
CODE[0x27] = 'Digit0'
for (let i = 0; i < 12; i++) CODE[0x3a + i] = 'F' + (i + 1)

export const eventCodeOf = (kc: number): string | undefined => CODE[kc]

/** US layout: HID usage -> [unshifted, shifted] character */
const US: Record<number, [string, string]> = {
  0x2c: [' ', ' '], 0x2d: ['-', '_'], 0x2e: ['=', '+'], 0x2f: ['[', '{'], 0x30: [']', '}'],
  0x31: ['\\', '|'], 0x33: [';', ':'], 0x34: ["'", '"'], 0x35: ['`', '~'], 0x36: [',', '<'],
  0x37: ['.', '>'], 0x38: ['/', '?'],
}
for (let i = 0; i < 26; i++) {
  const c = String.fromCharCode(97 + i)
  US[0x04 + i] = [c, c.toUpperCase()]
}
'1234567890'.split('').forEach((d, i) => (US[0x1e + i] = [d, '!@#$%^&*()'[i]]))

/** character -> { kc, shift } on a US layout */
export const CHAR_TO_KEY: Record<string, { kc: number; shift: boolean }> = {}
for (const [kc, [lo, hi]] of Object.entries(US)) {
  CHAR_TO_KEY[lo] = { kc: +kc, shift: false }
  if (hi !== lo) CHAR_TO_KEY[hi] = { kc: +kc, shift: true }
}

const LABEL: Record<number, string> = {
  0x28: 'Enter', 0x29: 'Esc', 0x2a: 'Bksp', 0x2b: 'Tab', 0x2c: 'Space', 0x39: 'Caps',
  0x46: 'PrtSc', 0x49: 'Ins', 0x4a: 'Home', 0x4b: 'PgUp', 0x4c: 'Del', 0x4d: 'End', 0x4e: 'PgDn',
  0x4f: '→', 0x50: '←', 0x51: '↓', 0x52: '↑', 0x64: 'ISO \\',
  0xa8: 'Mute', 0xa9: 'Vol +', 0xaa: 'Vol −', 0xab: 'Next', 0xac: 'Prev', 0xae: 'Play',
  0xbd: 'Bright +', 0xbe: 'Bright −',
  0xd1: 'Click', 0xd2: 'Right click', 0xd3: 'Middle click', 0xd9: 'Scroll ↑', 0xda: 'Scroll ↓',
  0xe0: 'Ctrl', 0xe1: 'Shift', 0xe2: 'Opt', 0xe3: 'Cmd', 0xe4: 'Ctrl', 0xe5: 'Shift', 0xe6: 'Opt', 0xe7: 'Cmd',
}
for (let i = 0; i < 12; i++) LABEL[0x3a + i] = 'F' + (i + 1)

const CUSTOM = ['BT 1', 'BT 2', 'BT 3', 'Next BT', 'Prev BT', 'Clear BT', 'USB / BT']

function modsName(m: number): string {
  const right = m & 0x10 ? 'Right ' : ''
  const low = m & 0x0f
  if (low === 0x0f) return right + 'Hyper'
  if (low === 0x07) return right + 'Meh'
  const parts: string[] = []
  if (m & 0x08) parts.push('Cmd')
  if (m & 0x01) parts.push('Ctrl')
  if (m & 0x04) parts.push('Opt')
  if (m & 0x02) parts.push('Shift')
  return right + parts.join('+')
}

export type KeyInfo = {
  /** main legend */
  label: string
  /** shifted legend shown above, if any */
  shiftLabel?: string
  kind: 'char' | 'mod' | 'layer' | 'oneshot' | 'action' | 'none' | 'trans' | 'media' | 'custom'
  /** layer this key activates while held (MO) */
  layer?: number
  /** modifier bits (C=1 S=2 A=4 G=8) for keys that send a group of modifiers (Hyper, one-shot keys) */
  mods?: number
  /** plain-language explanation */
  help: string
}

export function describe(kc: number): KeyInfo {
  if (kc === KC_NO) return { label: '', kind: 'none', help: 'Does nothing.' }
  if (kc === KC_TRNS) return { label: '', kind: 'trans', help: 'Falls through to the base layer.' }
  if (kc <= 0xff) {
    const us = US[kc]
    if (us && kc !== 0x2c) {
      const [lo, hi] = us
      const letter = /[a-z]/.test(lo)
      return letter
        ? { label: hi, kind: 'char', help: `Types ${lo} (Shift: ${hi}).` }
        : { label: lo, shiftLabel: hi, kind: 'char', help: `Types ${lo} (Shift: ${hi}).` }
    }
    const l = LABEL[kc]
    if (kc >= 0xe0) return { label: l, kind: 'mod', help: `${l} while held.` }
    if (kc >= 0xa5 && kc < 0xe0) return { label: l ?? `0x${kc.toString(16)}`, kind: 'media', help: `${l}.` }
    return { label: l ?? `0x${kc.toString(16)}`, kind: 'action', help: `${l ?? 'Key'}.` }
  }
  if (kc < 0x2000) {
    const m = modsName(kc >> 8)
    if ((kc & 0xff) === 0) {
      // modifiers only (e.g. Hyper): works while held, like a normal modifier key
      return { label: m, kind: 'mod', mods: (kc >> 8) & 0x0f, help: `${m} while held. Let go and it's off.` }
    }
    const inner = describe(kc & 0xff)
    return { label: `${m}+${inner.label}`, kind: 'action', help: `Sends ${m}+${inner.label}.` }
  }
  if (kc >= 0x2000 && kc < 0x4000) {
    // mod-tap: tap for the key, hold for the modifier
    const tap = describe(kc & 0xff)
    const m = modsName((kc >> 8) & 0x1f).replace('Right ', '')
    return { label: tap.label, shiftLabel: `hold ${m === 'Shift' ? '⇧' : m}`, kind: 'action', help: `Tap for ${tap.label}. Hold for ${m}.` }
  }
  if (kc >= 0x5220 && kc < 0x5240) {
    const layer = kc - 0x5220
    return { label: `Layer ${layer}`, kind: 'layer', layer, help: `Hold to use layer ${layer}.` }
  }
  if (kc >= 0x52a0 && kc < 0x52c0) {
    const m = modsName(kc - 0x52a0)
    return {
      label: m, kind: 'oneshot', mods: (kc - 0x52a0) & 0x0f,
      help: `One-shot ${m}: tap it, then press one key and it gets ${m}. Hold it to use it like a normal modifier.`,
    }
  }
  if (kc >= 0x7e00 && kc < 0x7e40) {
    const label = CUSTOM[kc - 0x7e00] ?? `KB${kc - 0x7e00}`
    const help = label.startsWith('BT')
      ? `Switch to Bluetooth device ${label.slice(3)}.`
      : label === 'USB / BT'
        ? 'Switch between USB priority and Bluetooth priority. In Bluetooth priority, a cable only charges the keyboard.'
        : label
    return { label, kind: 'custom', help }
  }
  return { label: `0x${kc.toString(16)}`, kind: 'action', help: 'Special key.' }
}
