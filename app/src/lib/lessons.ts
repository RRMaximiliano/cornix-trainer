import { describe, eventCodeOf, KC_NO, KC_TRNS } from './keycodes'
import { holdName, type Keymap } from './keymap'

export type KeyTarget = { code: string; label: string }

export type Lesson =
  | { kind: 'text'; id: string; title: string; summary: string; lines: string[] }
  | {
      kind: 'keys'; id: string; title: string; summary: string; targets: KeyTarget[]; rounds: number; caution?: string
      /** layer drill: the thumb key for this layer stays held for the whole drill */
      layer?: number
    }

/** Keys that only exist on `layer` (so pressing them proves the thumb key was held). */
function layerTargets(km: Keymap, layer: number, hand?: 'left' | 'right'): KeyTarget[] {
  const out: KeyTarget[] = []
  const seen = new Set<string>()
  for (const k of km.keys) {
    if (hand && k.hand !== hand) continue
    const kc = km.raw(layer, k.row, k.col)
    if (kc === KC_TRNS || kc === KC_NO) continue
    const code = eventCodeOf(kc)
    if (!code || seen.has(code) || /^(Shift|Control|Alt|Meta|CapsLock)/.test(code)) continue
    if (km.byEventCode.get(code)?.some((e) => e.layer === 0)) continue
    seen.add(code)
    out.push({ code, label: describe(kc).label })
  }
  return out
}

export function buildLessons(km: Keymap): Lesson[] {
  const drills: Lesson[] = []
  const keep = (l: number) => {
    const name = holdName(km, l)
    return name.endsWith('thumb') ? `Keep your ${name} down` : `Keep holding the ${name}`
  }
  for (const layer of km.usedLayers.filter((l) => l > 0)) {
    const all = layerTargets(km, layer)
    if (!all.length) continue
    const halves = (['left', 'right'] as const)
      .map((hand) => ({ hand, targets: layerTargets(km, layer, hand) }))
      .filter((h) => h.targets.length >= 3)
    const fkeys = all.every((t) => /^F\d+$/.test(t.code))
    const caution = fkeys
      ? 'If macOS uses an F-key as a shortcut (brightness, Mission Control, Show Desktop), the browser never sees it. Press Skip.'
      : undefined
    if (halves.length > 1) {
      for (const h of halves) {
        drills.push({
          kind: 'keys', id: `l${layer}-${h.hand}`, layer, rounds: 20, caution,
          title: `Layer ${layer} drill, ${h.hand} hand`,
          summary: `${keep(layer)} for the whole drill and press each key with your ${h.hand} hand.`,
          targets: h.targets,
        })
      }
    }
    drills.push({
      kind: 'keys', id: `l${layer}-all`, layer, rounds: 30, caution,
      title: `Layer ${layer} drill, all keys`,
      summary: `${keep(layer)} and find every key on layer ${layer}.`,
      targets: all,
    })
  }
  const at = LESSONS.findIndex((l) => l.id === 'accents')
  return [...LESSONS.slice(0, at), ...drills, ...LESSONS.slice(at)]
}

export const LESSONS: Lesson[] = [
  {
    kind: 'text', id: 'home', title: 'Home row',
    summary: 'Index fingers on F and J. Every other key is a reach from here.',
    lines: ['asdf jkl asdf jkl', 'a sad lad', 'ask dad for a flask', 'half a glass of salad', 'all flags fall as gas leaks'],
  },
  {
    kind: 'text', id: 'thumbs', title: 'Space on your resting thumbs',
    summary: 'Space is the middle thumb key on both sides, where your thumbs already rest.',
    lines: ['it is on a big red bus', 'we can go to the sea', 'up and down the hill', 'so far so good', 'a cup of tea at ten'],
  },
  {
    kind: 'text', id: 'top', title: 'Top row',
    summary: 'Reach up from the home row and come straight back.',
    lines: ['we were out of the tree', 'try to write it there', 'your pet tiger is quiet', 'power to the people', 'quite a few typewriters'],
  },
  {
    kind: 'text', id: 'bottom', title: 'Bottom row',
    summary: 'Curl down for Z through M, plus comma and period.',
    lines: ['move my van, bob.', 'calm, brave, and clever.', 'zinc box, mixed vibe.', 'a cozy cabin by the moon.', 'zebras vex a nimble cow.'],
  },
  {
    kind: 'keys', id: 'edges', title: 'Esc, Tab, Enter, Backspace',
    summary: 'The outer columns. Esc is where Caps Lock used to be. Backspace and Enter sit on the right edge.',
    targets: [
      { code: 'Escape', label: 'Esc' }, { code: 'Tab', label: 'Tab' },
      { code: 'Enter', label: 'Enter' }, { code: 'Backspace', label: 'Backspace' },
    ],
    rounds: 16,
  },
  {
    kind: 'text', id: 'numbers', title: 'Numbers (hold Layer 1)',
    summary: 'Hold the Layer 1 key (bottom-left row, third key). The top row becomes 1–0, in the same order as a normal keyboard.',
    lines: ['1 2 3 4 5 6 7 8 9 0', '2026', 'room 4 on floor 3', 'call 617 555 0142', '3.14 and 2.718'],
  },
  {
    kind: 'text', id: 'symbols', title: 'Symbols',
    summary: 'The common symbols ; - = [ ] \\ sit under your fingers while you hold Layer 1. Add Shift for : _ + { } |.',
    lines: ['x = y - 1;', 'arr[i] = arr[j];', 'a_b + c_d', '{ id: 42 }', 'path/to/file.txt', "don't stop; it's fine", 'one | two \\ three'],
  },
  {
    kind: 'text', id: 'accents', title: 'Accents and ñ',
    summary: "Your Mac uses U.S. International – PC, so ' is a dead key: tap ' then o for ó. Shift+' then u gives ü. ~ then n gives ñ.",
    lines: ['canción', 'está aquí', 'también', 'qué tal, cómo estás', 'mañana', 'el niño come piña', 'pingüino', 'número de teléfono'],
  },
  {
    kind: 'keys', id: 'nav', title: 'Arrows and paging',
    summary: 'Arrows live in the bottom-right corner like your Alice. Hold Layer 1 for Page Up, Page Down and Delete.',
    targets: [
      { code: 'ArrowUp', label: '↑' }, { code: 'ArrowDown', label: '↓' },
      { code: 'ArrowLeft', label: '←' }, { code: 'ArrowRight', label: '→' },
      { code: 'PageUp', label: 'Page Up' }, { code: 'PageDown', label: 'Page Down' },
      { code: 'Delete', label: 'Delete' },
    ],
    rounds: 20,
  },
  {
    kind: 'text', id: 'english', title: 'Sentences in English',
    summary: 'Everything together, at your own pace.',
    lines: [
      'The quick brown fox jumps over the lazy dog.',
      "I'll send the draft by Friday, after 3 pm.",
      'Results are in table 2; see the appendix.',
      'We tested 12 schools across 4 districts.',
      'Split keyboards take a week to feel natural.',
    ],
  },
  {
    kind: 'text', id: 'spanish', title: 'Oraciones en español',
    summary: 'Accents in real sentences.',
    lines: [
      'Mañana tengo una reunión a las diez.',
      'El análisis está casi terminado.',
      'Me gustó mucho la sección tres.',
      'La investigación incluyó a cuarenta niños.',
      'Gracias por tu ayuda, de verdad.',
    ],
  },
]
