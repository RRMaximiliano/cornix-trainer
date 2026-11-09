// Work out which physical key produced a keydown.
//
// The Mac only sees what a key sends, so two keys that send the same thing (both Space keys,
// or a one-shot Hyper key and the separate Ctrl/Opt/Cmd/Shift keys) look identical.
// When the keyboard is connected over WebHID we ask it which switch is down; otherwise we guess.

import { describe } from './keycodes'
import { locate, type Keymap } from './keymap'
import { isConnected, readMatrix } from './webhid'

const MOD_CODE = /^(Shift|Control|Alt|Meta)/
let lastModAt = 0
let modBurstStart = 0

type Osm = { id: string; mods: number }
const osmCache = new WeakMap<Keymap, Osm[]>()
function oneShots(km: Keymap): Osm[] {
  let list = osmCache.get(km)
  if (!list) {
    // keys that send a group of modifiers at once: one-shot keys and held combos like Hyper
    list = km.keys
      .map((k) => ({ id: k.id, mods: describe(km.raw(0, k.row, k.col)).mods ?? 0 }))
      .filter((x) => [1, 2, 4, 8].filter((b) => x.mods & b).length >= 2)
    osmCache.set(km, list)
  }
  return list
}

export type Guess = {
  /** best guess right away (may list several keys when it's ambiguous) */
  ids: string[]
  layer: number
  /** true when this keydown was part of a one-shot modifier key */
  oneShot: boolean
  /** set when asking the keyboard could give a better answer */
  ask: boolean
}

export function guessPressed(km: Keymap, e: KeyboardEvent, preferLayer = 0): Guess {
  const now = performance.now()
  if (MOD_CODE.test(e.code)) {
    // Keydowns from one HID report arrive within a few ms of each other.
    if (now - lastModAt > 40) modBurstStart = now
    lastModAt = now
    const mods = (e.ctrlKey ? 1 : 0) | (e.shiftKey ? 2 : 0) | (e.altKey ? 4 : 0) | (e.metaKey ? 8 : 0)
    const burst = now - modBurstStart < 40
    const osm = oneShots(km).find((o) => o.mods === mods)
    const bits = [1, 2, 4, 8].filter((b) => mods & b).length
    if (osm && bits >= 2 && burst) return { ids: [osm.id], layer: 0, oneShot: true, ask: isConnected() }
  }
  const loc = locate(km, e.code, preferLayer)
  if (!loc) return { ids: [], layer: preferLayer, oneShot: false, ask: isConnected() }
  const sameLayer = (km.byEventCode.get(e.code) ?? []).filter((x) => x.layer === loc.layer).map((x) => x.id)
  const ambiguous = sameLayer.length > 1 || MOD_CODE.test(e.code)
  return { ids: sameLayer.length > 1 ? sameLayer : [loc.id], layer: loc.layer, oneShot: false, ask: ambiguous && isConnected() }
}

/** Ask the keyboard which switches are down. Resolves to null if it can't tell. */
export async function exactPressed(km: Keymap, guess: Guess): Promise<string[] | null> {
  try {
    const held = await readMatrix(km.file.matrix.rows, km.file.matrix.cols)
    if (!held.length) return null
    // keep only keys that could have sent this (or a thumb layer key / one-shot key)
    const candidates = new Set([...guess.ids, ...oneShots(km).map((o) => o.id), ...km.layerKey.values()])
    const hit = held.filter((id) => candidates.has(id))
    return hit.length ? hit : null
  } catch {
    return null
  }
}
