import { CHAR_TO_KEY, KC_NO, KC_TRNS, describe, eventCodeOf } from './keycodes'

export type KeymapFile = {
  name: string
  exportedAt: string
  matrix: { rows: number; cols: number }
  layout: unknown[][]
  layers: number[][][]
}

export type PhysKey = {
  id: string // "row,col"
  row: number
  col: number
  x: number
  y: number
  w: number
  h: number
  r: number
  rx: number
  ry: number
  hand: 'left' | 'right'
}

/** Parse a KLE layout as used in Vial definitions (skips encoder entries). */
export function parseKle(rows: unknown[][]): PhysKey[] {
  const keys: PhysKey[] = []
  let r = 0, rx = 0, ry = 0, x = 0, y = 0, w = 1, h = 1
  for (const row of rows) {
    for (const item of row) {
      if (typeof item === 'object' && item !== null) {
        const o = item as Record<string, number>
        if (o.r != null) r = o.r
        if (o.rx != null) { rx = o.rx; x = rx; y = ry }
        if (o.ry != null) { ry = o.ry; x = rx; y = ry }
        if (o.x != null) x += o.x
        if (o.y != null) y += o.y
        if (o.w != null) w = o.w
        if (o.h != null) h = o.h
        continue
      }
      const labels = String(item).split('\n')
      const isEncoder = labels[9] === 'e'
      if (!isEncoder) {
        const [row_, col] = labels[0].split(',').map(Number)
        keys.push({ id: `${row_},${col}`, row: row_, col, x, y, w, h, r, rx, ry, hand: 'left' })
      }
      x += w
      w = 1
      h = 1
    }
    y += 1
    x = rx
  }
  return keys
}

export type Keymap = {
  file: KeymapFile
  keys: PhysKey[]
  /** keycode at layer/row/col, resolving transparent keys down to the base layer */
  at: (layer: number, row: number, col: number) => number
  raw: (layer: number, row: number, col: number) => number
  /** physical key ids that send a given KeyboardEvent.code, best layer first */
  byEventCode: Map<string, { id: string; layer: number }[]>
  /** base-layer key that holds each layer */
  layerKey: Map<number, string>
  shiftKey?: string
  usedLayers: number[]
}

export function buildKeymap(file: KeymapFile): Keymap {
  const half = file.matrix.rows / 2
  const keys = parseKle(file.layout).map((k) => ({ ...k, hand: (k.row < half ? 'left' : 'right') as PhysKey['hand'] }))
  const raw = (l: number, r: number, c: number) => file.layers[l]?.[r]?.[c] ?? KC_NO
  const at = (l: number, r: number, c: number) => {
    for (let i = l; i >= 0; i--) {
      const kc = raw(i, r, c)
      if (kc !== KC_TRNS) return kc
    }
    return KC_NO
  }
  const layerKey = new Map<number, string>()
  let shiftKey: string | undefined
  for (const k of keys) {
    const info = describe(raw(0, k.row, k.col))
    if (info.kind === 'layer' && info.layer != null && !layerKey.has(info.layer)) layerKey.set(info.layer, k.id)
    if (raw(0, k.row, k.col) === 0xe1) shiftKey = k.id
  }
  const usedLayers = [0, ...[...layerKey.keys()].sort()]
  const byEventCode = new Map<string, { id: string; layer: number }[]>()
  for (const layer of usedLayers) {
    for (const k of keys) {
      const kc = layer === 0 ? raw(0, k.row, k.col) : raw(layer, k.row, k.col)
      if (layer > 0 && (kc === KC_TRNS || kc === KC_NO)) continue
      const code = eventCodeOf(kc)
      if (!code) continue
      const list = byEventCode.get(code) ?? []
      list.push({ id: k.id, layer })
      byEventCode.set(code, list)
    }
  }
  return { file, keys, at, raw, byEventCode, layerKey, shiftKey, usedLayers }
}

/** What to call the key that holds a layer: "left thumb" for a thumb key, otherwise "Layer 1 key". */
export function holdName(km: Keymap, layer: number): string {
  const id = km.layerKey.get(layer)
  const k = km.keys.find((x) => x.id === id)
  if (!k) return `layer ${layer} key`
  const half = km.file.matrix.rows / 2
  const thumb = k.row % half === half - 1 && k.col >= 3
  return thumb ? `${k.hand} thumb` : `Layer ${layer} key`
}

/** One stroke: optionally hold a layer key and/or shift, then press a key. */
export type Stroke = {
  key: string // physical key id
  layer: number
  shift: boolean
  label: string
}

export type Recipe = { strokes: Stroke[]; note?: string }

// US International – PC dead keys (macOS): ' " ` ~ ^ combine with the next letter.
const ACCENTS: Record<string, [string, string]> = {
  á: ["'", 'a'], é: ["'", 'e'], í: ["'", 'i'], ó: ["'", 'o'], ú: ["'", 'u'],
  Á: ["'", 'A'], É: ["'", 'E'], Í: ["'", 'I'], Ó: ["'", 'O'], Ú: ["'", 'U'],
  ü: ['"', 'u'], Ü: ['"', 'U'], ñ: ['~', 'n'], Ñ: ['~', 'N'],
}
export const DEAD = new Set(["'", '"', '`', '~', '^'])

export function strokeFor(km: Keymap, ch: string): Stroke | undefined {
  const target = CHAR_TO_KEY[ch]
  if (!target) return undefined
  for (const layer of km.usedLayers) {
    for (const k of km.keys) {
      if (km.at(layer, k.row, k.col) === target.kc) {
        // on higher layers only count keys actually defined there
        if (layer > 0 && km.raw(layer, k.row, k.col) === KC_TRNS) continue
        return { key: k.id, layer, shift: target.shift, label: ch === ' ' ? 'Space' : ch }
      }
    }
  }
  return undefined
}

export function recipeFor(km: Keymap, ch: string): Recipe | undefined {
  const acc = ACCENTS[ch]
  if (acc) {
    const a = strokeFor(km, acc[0])
    const b = strokeFor(km, acc[1])
    if (!a || !b) return undefined
    return { strokes: [a, b], note: `Tap ${acc[0]} first. Nothing shows until you type ${acc[1]}.` }
  }
  const s = strokeFor(km, ch)
  if (!s) return undefined
  if (DEAD.has(ch)) return { strokes: [s], note: `${ch} waits for the next letter. Before a vowel, add a Space to get a plain ${ch}.` }
  return { strokes: [s] }
}

/** Which key id + layer a physical keypress (event.code) most likely came from. */
export function locate(km: Keymap, code: string, preferLayer = 0) {
  const list = km.byEventCode.get(code)
  if (!list?.length) return undefined
  return list.find((x) => x.layer === preferLayer) ?? list[0]
}
