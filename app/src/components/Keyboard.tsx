import { useMemo } from 'react'
import { KC_NO, KC_TRNS, describe } from '../lib/keycodes'
import type { Keymap, PhysKey } from '../lib/keymap'

export type Mark = 'target' | 'hold' | 'pressed' | 'miss' | 'selected'
export type MarkInfo = { mark: Mark; layer: number }

const U = 64

function corners(k: PhysKey) {
  const rad = (k.r * Math.PI) / 180
  const pts = [
    [k.x, k.y], [k.x + k.w, k.y], [k.x, k.y + k.h], [k.x + k.w, k.y + k.h],
  ]
  return pts.map(([px, py]) => {
    const dx = px - k.rx, dy = py - k.ry
    return [k.rx + dx * Math.cos(rad) - dy * Math.sin(rad), k.ry + dx * Math.sin(rad) + dy * Math.cos(rad)]
  })
}

function splitLabel(label: string): string[] {
  if (label.length <= 6) return [label]
  const i = label.indexOf('+') > 0 ? label.indexOf('+') + 1 : label.indexOf(' ')
  return i > 0 ? [label.slice(0, i).trim(), label.slice(i).trim()] : [label]
}

type Props = {
  km: Keymap
  layer: number
  marks?: Record<string, MarkInfo>
  heat?: Record<string, number>
  onHover?: (id: string | null) => void
  onSelect?: (id: string) => void
  label?: string
}

export function Keyboard({ km, layer, marks = {}, heat, onHover, onSelect, label }: Props) {
  const box = useMemo(() => {
    const all = km.keys.flatMap(corners)
    const xs = all.map((p) => p[0]), ys = all.map((p) => p[1])
    const pad = 0.15
    return {
      x: (Math.min(...xs) - pad) * U, y: (Math.min(...ys) - pad) * U,
      w: (Math.max(...xs) - Math.min(...xs) + 2 * pad) * U, h: (Math.max(...ys) - Math.min(...ys) + 2 * pad) * U,
    }
  }, [km])

  return (
    <svg
      className="kb"
      viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
      role="img"
      aria-label={label ?? 'Cornix keyboard'}
      onMouseLeave={() => onHover?.(null)}
    >
      {km.keys.map((k) => {
        const rawHere = km.raw(layer, k.row, k.col)
        const fallsThrough = layer > 0 && rawHere === KC_TRNS
        const kc = fallsThrough ? km.raw(0, k.row, k.col) : rawHere
        const info = describe(kc)
        const m = marks[k.id]
        const layerOfKey = info.kind === 'layer' ? info.layer : undefined
        const w = k.w * U, h = k.h * U
        const lines = info.kind === 'layer' ? ['Layer', String(info.layer)] : splitLabel(info.label)
        const big = lines.length === 1 && lines[0].length <= 2
        const fs = big ? 21 : lines.some((l) => l.length > 5) ? 11.5 : 14
        const cls = [
          'key',
          m ? `m-${m.mark}` : '',
          m ? `on-l${m.layer}` : '',
          layerOfKey ? `mo-l${layerOfKey}` : '',
          fallsThrough ? 'faded' : '',
          rawHere === KC_NO && layer > 0 ? 'dead' : '',
          onSelect ? 'clickable' : '',
        ].join(' ')
        const heatV = heat?.[k.id] ?? 0
        return (
          <g key={k.id} transform={`rotate(${k.r} ${k.rx * U} ${k.ry * U})`}>
            <g
              className={cls}
              transform={`translate(${k.x * U} ${k.y * U})`}
              onMouseEnter={() => onHover?.(k.id)}
              onClick={() => onSelect?.(k.id)}
            >
              <title>{info.help}</title>
              <rect className="cap" x={2.5} y={2.5} width={w - 5} height={h - 5} rx={10} />
              <rect className="top" x={7} y={5} width={w - 14} height={h - 15} rx={7} />
              {heatV > 0 && (
                <rect className="heat" x={7} y={5} width={w - 14} height={h - 15} rx={7} style={{ opacity: Math.min(0.9, 0.15 + heatV) }} />
              )}
              {info.shiftLabel && (
                <text className="legend shift" x={w / 2} y={h / 2 - 10} fontSize={12}>
                  {info.shiftLabel}
                </text>
              )}
              {lines.map((line, i) => (
                <text
                  key={i}
                  className="legend"
                  x={w / 2}
                  y={h / 2 - 3 + (info.shiftLabel ? 9 : 0) + (i - (lines.length - 1) / 2) * (fs + 1)}
                  fontSize={fs}
                >
                  {line}
                </text>
              ))}
            </g>
          </g>
        )
      })}
    </svg>
  )
}
