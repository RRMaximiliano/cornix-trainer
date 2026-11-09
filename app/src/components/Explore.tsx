import { useEffect, useMemo, useState } from 'react'
import { Keyboard, type MarkInfo } from './Keyboard'
import { thumbOf } from './Practice'
import { KC_NO, KC_TRNS, describe } from '../lib/keycodes'
import type { Keymap } from '../lib/keymap'
import { exactPressed, guessPressed } from '../lib/pressed'

const isMod = (code: string) => /^(Shift|Control|Alt|Meta)/.test(code)

const MODS = [
  { prop: 'metaKey', label: 'Cmd' },
  { prop: 'shiftKey', label: 'Shift' },
  { prop: 'ctrlKey', label: 'Ctrl' },
  { prop: 'altKey', label: 'Opt' },
] as const

type Last = { key: string; code: string; mods: string[]; id?: string; layer: number }

export function Explore({ km }: { km: Keymap }) {
  const [layer, setLayer] = useState(0)
  const [focus, setFocus] = useState<string | null>(null)
  const [last, setLast] = useState<Last | null>(null)
  const [held, setHeld] = useState<Set<string>>(new Set())
  const { modKeyIds, oneShotIds } = useMemo(() => {
    const modKeyIds: string[] = []
    const oneShotIds: string[] = []
    for (const k of km.keys) {
      const info = describe(km.raw(0, k.row, k.col))
      const group = [1, 2, 4, 8].filter((b) => (info.mods ?? 0) & b).length >= 2
      if (group) oneShotIds.push(k.id)
      else if (info.kind === 'mod') modKeyIds.push(k.id)
    }
    return { modKeyIds, oneShotIds }
  }, [km])

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'SELECT') return
      if (/^(Space|Arrow|Page|Home|End|Backspace)/.test(e.code) || /^F\d+$/.test(e.code)) e.preventDefault()
      // The thumb layer keys send nothing to the computer, so infer the layer from the key that arrives:
      // a key that only exists on layer 1 means the left thumb is down.
      const g = guessPressed(km, e, layer)
      if (g.ids.length && g.layer !== layer && !isMod(e.code)) setLayer(g.layer)
      const mods = MODS.filter((m) => e[m.prop]).map((m) => m.label)
      setLast({ key: e.key, code: e.code, mods, id: g.ids[0], layer: g.layer })
      setHeld((h) => {
        const n = new Set(h)
        // a one-shot key sends several modifiers; show the one thumb key instead of Ctrl/Opt/Cmd/Shift
        if (g.oneShot) modKeyIds.forEach((id) => n.delete(id))
        g.ids.forEach((id) => n.add(id))
        return n
      })
      if (g.ask && !e.repeat) {
        exactPressed(km, g).then((ids) => {
          if (!ids) return
          setHeld((h) => {
            const n = new Set(h)
            g.ids.forEach((id) => n.delete(id))
            ids.forEach((id) => n.add(id))
            return n
          })
          const thumbLayer = [...km.layerKey].find(([, id]) => ids.includes(id))?.[0]
          if (thumbLayer != null) setLayer(thumbLayer)
        })
      }
    }
    const up = (e: KeyboardEvent) => {
      const ids = new Set((km.byEventCode.get(e.code) ?? []).map((x) => x.id))
      if (isMod(e.code)) oneShotIds.forEach((id) => ids.add(id))
      km.layerKey.forEach((id) => ids.add(id))
      setHeld((h) => new Set([...h].filter((id) => !ids.has(id))))
    }
    const clear = () => setHeld(new Set())
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', clear)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', clear)
    }
  }, [km, layer, modKeyIds, oneShotIds])

  const marks: Record<string, MarkInfo> = {}
  held.forEach((id) => (marks[id] = { mark: 'pressed', layer }))
  if (focus) marks[focus] = { mark: 'selected', layer }

  const fk = focus ? km.keys.find((k) => k.id === focus) : undefined
  const layerTabs = km.usedLayers.map((l) => ({
    l, label: l === 0 ? 'Base' : `Hold ${thumbOf(km, l)}`,
  }))

  return (
    <div className="explore">
      <div className="explore-head">
        <div className="seg" role="tablist" aria-label="Layer">
          {layerTabs.map(({ l, label }) => (
            <button key={l} role="tab" aria-selected={layer === l} className={`seg-btn l${l} ${layer === l ? 'active' : ''}`} onClick={() => setLayer(l)}>
              {label}
            </button>
          ))}
        </div>
        <p className="summary">
          Point at a key to see what it does on every layer. Hold a layer key and press anything: the drawing switches to that layer.
        </p>
      </div>

      <Keyboard km={km} layer={layer} marks={marks} onHover={setFocus} label={`Cornix layout, ${layerTabs.find((t) => t.l === layer)?.label}`} />

      <div className="explore-grid">
        <section className="panel">
          <h3>{fk ? 'This key' : 'Point at a key'}</h3>
          {fk ? (
            <dl className="key-layers">
              {km.usedLayers.map((l) => {
                const raw = km.raw(l, fk.row, fk.col)
                const info = describe(l > 0 && raw === KC_TRNS ? km.raw(0, fk.row, fk.col) : raw)
                const same = l > 0 && raw === KC_TRNS
                return (
                  <div key={l} className={`kl l${l}`}>
                    <dt>{l === 0 ? 'Base' : `With ${thumbOf(km, l)}`}</dt>
                    <dd>{raw === KC_NO ? 'Nothing' : same ? 'Same as base' : info.help}</dd>
                  </div>
                )
              })}
            </dl>
          ) : (
            <p className="muted">Each key can do something different on each layer. Hold a layer key to switch layers.</p>
          )}
        </section>

        <section className="panel">
          <h3>Last key you pressed</h3>
          {last ? (
            <>
              <p className="last-key">
                <kbd>{last.key === ' ' ? 'Space' : last.key === 'Dead' ? 'Dead key (accent)' : last.key}</kbd>
                {last.layer > 0 && <span className={`chip l${last.layer}`}>from layer {last.layer}</span>}
              </p>
              <ul className="mods" aria-label="Modifiers held">
                {MODS.map((m) => (
                  <li key={m.label} className={last.mods.includes(m.label) ? 'on' : ''}>{m.label}</li>
                ))}
              </ul>
              {last.mods.length === 4 && <p className="muted">That was Hyper: all four modifiers at once.</p>}
            </>
          ) : (
            <p className="muted">Press anything. Try tapping a one-shot thumb key and then a letter to see the modifiers it adds.</p>
          )}
        </section>

        <section className="panel">
          <h3>Thumb keys</h3>
          <ul className="facts">
            <li>Space is the middle thumb key on both sides.</li>
            <li>Hyper (right, tilted) works while held, like on your Alice.</li>
            <li>Cmd+Shift (left, tilted) is one-shot: tap it, then press one key. You can also hold it.</li>
            <li>Cmd is the outer left thumb key.</li>
            <li>Hold the {thumbOf(km, 1)} for numbers and symbols. Hold the {thumbOf(km, 2)} for F-keys, media and Bluetooth.</li>
            <li>One knob turns the volume, the other scrolls.</li>
          </ul>
        </section>
      </div>
    </div>
  )
}
