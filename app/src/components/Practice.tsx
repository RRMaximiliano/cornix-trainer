import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { Keyboard, type MarkInfo } from './Keyboard'
import { describe, eventCodeOf } from '../lib/keycodes'
import { holdName, locate, recipeFor, type Keymap, type Stroke } from '../lib/keymap'
import { exactPressed, guessPressed } from '../lib/pressed'
import { buildLessons, type Lesson, type KeyTarget } from '../lib/lessons'
import { bump, put, saveStats, store, type Stats } from '../lib/stats'

type Hints = 'always' | 'delay' | 'never'
type Record_ = (fn: (s: Stats) => void) => void

const MODIFIER_CODES = /^(Shift|Control|Alt|Meta|CapsLock|Fn)/
const BLOCKED_KEYS = new Set([
  'Tab', 'Enter', 'Backspace', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'PageUp', 'PageDown', 'Delete', 'Home', 'End',
])

export const thumbOf = holdName

function keyName(km: Keymap, id: string, layer: number) {
  const k = km.keys.find((x) => x.id === id)!
  const here = describe(km.at(layer, k.row, k.col)).label
  const base = describe(km.raw(0, k.row, k.col)).label
  return layer > 0 && base && base !== here ? `the ${base} key` : here || 'that key'
}

function marksFor(km: Keymap, s: Stroke | undefined): Record<string, MarkInfo> {
  const marks: Record<string, MarkInfo> = {}
  if (!s) return marks
  if (s.layer > 0) {
    const id = km.layerKey.get(s.layer)
    if (id) marks[id] = { mark: 'hold', layer: s.layer }
  }
  if (s.shift && km.shiftKey) marks[km.shiftKey] = { mark: 'hold', layer: 0 }
  marks[s.key] = { mark: 'target', layer: s.layer }
  return marks
}

function StrokeSteps({ km, strokes, active }: { km: Keymap; strokes: Stroke[]; active: number }) {
  return (
    <ol className="steps">
      {strokes.map((s, i) => (
        <li key={i} className={i === active ? 'step now' : i < active ? 'step past' : 'step'}>
          {s.layer > 0 && <span className={`chip l${s.layer}`}>Hold {thumbOf(km, s.layer)}</span>}
          {s.shift && <span className="chip shift">Hold Shift</span>}
          {s.key && <span className={`chip press l${s.layer}`}>{keyName(km, s.key, s.layer)}</span>}
        </li>
      ))}
    </ol>
  )
}

/** Hidden textarea that receives typing, including dead-key compositions. */
function useCapture() {
  const ref = useRef<HTMLTextAreaElement>(null)
  const [focused, setFocused] = useState(false)
  useEffect(() => ref.current?.focus(), [])
  const focus = () => ref.current?.focus()
  return { ref, focused, setFocused, focus }
}

type Flash = { ids: string[]; mark: 'pressed' | 'miss' }

/** Briefly lights the key(s) just pressed; asks the keyboard for the exact key when it's ambiguous. */
function useFlash(km: Keymap) {
  const [flash, setFlash] = useState<Flash | null>(null)
  const current = useRef<Flash | null>(null)
  const timer = useRef<number>(0)
  const lastIds = useRef<string[]>([])
  const show = (ids: string[], mark: Flash['mark'], ms = mark === 'miss' ? 450 : 180) => {
    if (!ids.length) return
    window.clearTimeout(timer.current)
    current.current = { ids, mark }
    setFlash(current.current)
    timer.current = window.setTimeout(() => {
      current.current = null
      setFlash(null)
    }, ms)
  }
  /** call from keydown */
  const press = (e: KeyboardEvent, preferLayer: number) => {
    const g = guessPressed(km, e, preferLayer)
    lastIds.current = g.ids
    if (!e.repeat) show(g.ids, 'pressed')
    if (g.ask && !e.repeat) {
      exactPressed(km, g).then((ids) => {
        if (!ids) return
        lastIds.current = ids
        show(ids, current.current?.mark ?? 'pressed')
      })
    }
    return g
  }
  const miss = () => show(lastIds.current, 'miss')
  const apply = (marks: Record<string, MarkInfo>) => {
    if (flash) for (const id of flash.ids) marks[id] = { mark: flash.mark, layer: marks[id]?.layer ?? 0 }
    return marks
  }
  return { press, miss, apply }
}

type Result = { speed: string; acc: number }

function Done({ result, onAgain, onNext, hasNext }: { result: Result; onAgain: () => void; onNext: () => void; hasNext: boolean }) {
  const ref = useRef<HTMLButtonElement>(null)
  useEffect(() => ref.current?.focus(), [])
  return (
    <div className="done">
      <p className="done-line">
        Lesson complete. {result.speed}, {Math.round(result.acc * 100)}% accuracy.
      </p>
      <div className="done-actions">
        <button ref={ref} className="btn primary" onClick={hasNext ? onNext : onAgain}>
          {hasNext ? 'Next lesson' : 'Practice again'}
        </button>
        {hasNext && <button className="btn" onClick={onAgain}>Practice again</button>}
      </div>
    </div>
  )
}

function TextDrill({ km, lesson, hints, record, onNext, onAgain, hasNext }: {
  km: Keymap; lesson: Extract<Lesson, { kind: 'text' }>; hints: Hints; record: Record_
  onNext: () => void; onAgain: () => void; hasNext: boolean
}) {
  const cap = useCapture()
  const flash = useFlash(km)
  const cur = useRef({ line: 0, pos: 0 })
  const [, force] = useState(0)
  const [dead, setDead] = useState(false)
  const [missAt, setMissAt] = useState<string | null>(null)
  const [idle, setIdle] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const run = useRef({ start: 0, chars: 0, misses: 0 })
  const [capsOn, setCapsOn] = useState(false)

  const { line: li, pos } = cur.current
  const line = lesson.lines[li]
  const ch = line[pos]
  const recipe = ch != null ? recipeFor(km, ch) : undefined
  const active = dead && recipe && recipe.strokes.length > 1 ? 1 : 0
  const stroke = recipe?.strokes[active]
  const here = `${li}:${pos}`

  useEffect(() => {
    setIdle(false)
    if (hints !== 'delay') return
    const t = setTimeout(() => setIdle(true), 1500)
    return () => clearTimeout(t)
  }, [here, dead, hints])

  const showHint = !result && (hints === 'always' || idle || missAt === here)
  const marks = showHint ? marksFor(km, stroke) : {}
  flash.apply(marks)

  function processChar(c: string) {
    const { line: l, pos: p } = cur.current
    const expected = lesson.lines[l][p]
    if (expected == null) return
    if (!run.current.start) run.current.start = performance.now()
    const keyId = recipeFor(km, expected)?.strokes.at(-1)?.key
    const ok = c === expected
    record((s) => {
      bump(s.chars, expected, !ok)
      if (keyId) bump(s.keys, keyId, !ok)
    })
    if (!ok) {
      run.current.misses++
      setMissAt(`${l}:${p}`)
      flash.miss()
      return
    }
    run.current.chars++
    if (p + 1 < lesson.lines[l].length) cur.current = { line: l, pos: p + 1 }
    else if (l + 1 < lesson.lines.length) cur.current = { line: l + 1, pos: 0 }
    else {
      cur.current = { line: l, pos: p + 1 }
      const min = (performance.now() - run.current.start) / 60000
      const wpm = Math.round(run.current.chars / 5 / Math.max(min, 1 / 60))
      const acc = run.current.chars / (run.current.chars + run.current.misses)
      record((s) => {
        const prev = s.lessons[lesson.id]
        s.lessons[lesson.id] = {
          runs: (prev?.runs ?? 0) + 1,
          bestWpm: Math.max(prev?.bestWpm ?? 0, wpm),
          bestAcc: Math.max(prev?.bestAcc ?? 0, acc),
          lastAt: new Date().toISOString(),
        }
      })
      setResult({ speed: `${wpm} words per minute`, acc })
    }
  }

  function flush() {
    const ta = cap.ref.current
    if (!ta) return
    const v = ta.value
    ta.value = ''
    setDead(false)
    for (const c of v) processChar(c)
    force((n) => n + 1)
  }

  return (
    <div className="drill" onClick={cap.focus}>
      <textarea
        ref={cap.ref}
        className="capture"
        aria-label="Type the text shown"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        onFocus={() => cap.setFocused(true)}
        onBlur={() => cap.setFocused(false)}
        onKeyDown={(e) => {
          flash.press(e.nativeEvent, stroke?.layer ?? 0)
          if (e.key === 'Dead') setDead(true)
          setCapsOn(e.getModifierState('CapsLock'))
          if (BLOCKED_KEYS.has(e.key) || /^F\d+$/.test(e.key)) e.preventDefault()
        }}
        onInput={(e) => {
          if (!(e.nativeEvent as InputEvent).isComposing) flush()
        }}
        onCompositionEnd={flush}
      />
      {result ? (
        <Done result={result} onAgain={onAgain} onNext={onNext} hasNext={hasNext} />
      ) : (
        <div className={cap.focused ? 'prompt' : 'prompt blurred'}>
          <p className="line" aria-live="off">
            {line.split('').map((c, i) => (
              <span
                key={i}
                className={[
                  i < pos ? 'c done' : i === pos ? 'c cur' : 'c',
                  c === ' ' ? 'sp' : '',
                  i === pos && missAt === here ? 'miss' : '',
                  i === pos && dead ? 'pending' : '',
                ].join(' ')}
              >
                {c === ' ' ? ' ' : c}
              </span>
            ))}
          </p>
          <p className="next-line">{lesson.lines[li + 1] ?? ' '}</p>
          {!cap.focused && <p className="resume">Click here to keep typing</p>}
        </div>
      )}
      <div className="hint-row" aria-live="polite">
        {capsOn && <p className="note miss-note">Caps Lock is on. Press Caps Lock on your laptop keyboard to turn it off.</p>}
        {!result && showHint && recipe && (recipe.strokes.length > 1 || stroke!.layer > 0 || stroke!.shift || recipe.note) && (
          <>
            <StrokeSteps km={km} strokes={recipe.strokes} active={active} />
            {recipe.note && <p className="note">{recipe.note}</p>}
          </>
        )}
        {!result && ch != null && !recipe && <p className="note">{ch} isn’t on your keymap. Type it however you like.</p>}
      </div>
      <Keyboard km={km} layer={showHint ? stroke?.layer ?? 0 : 0} marks={marks} label="Keyboard showing the next key" />
      <p className="counter">
        Line {li + 1} of {lesson.lines.length}
        {run.current.misses > 0 && <>, {run.current.misses} {run.current.misses === 1 ? 'miss' : 'misses'}</>}
      </p>
    </div>
  )
}

function shuffleTargets(targets: KeyTarget[], rounds: number): KeyTarget[] {
  const out: KeyTarget[] = []
  while (out.length < rounds) {
    const t = targets[Math.floor(Math.random() * targets.length)]
    if (out.at(-1)?.code !== t.code) out.push(t)
  }
  return out
}

function KeyDrill({ km, lesson, hints, record, onNext, onAgain, hasNext }: {
  km: Keymap; lesson: Extract<Lesson, { kind: 'keys' }>; hints: Hints; record: Record_
  onNext: () => void; onAgain: () => void; hasNext: boolean
}) {
  const cap = useCapture()
  const flash = useFlash(km)
  const [seq] = useState(() => shuffleTargets(lesson.targets, lesson.rounds))
  const [idx, setIdx] = useState(0)
  const [missed, setMissed] = useState<string | false>(false)
  const [idle, setIdle] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const run = useRef({ start: 0, hits: 0, misses: 0 })

  const target = seq[idx]
  const loc = target ? locate(km, target.code, lesson.layer ?? 0) : undefined
  const stroke: Stroke | undefined = loc && { key: loc.id, layer: loc.layer, shift: false, label: target.label }
  const thumbId = lesson.layer ? km.layerKey.get(lesson.layer) : undefined

  useEffect(() => {
    setIdle(false)
    setMissed(false)
    if (hints !== 'delay') return
    const t = setTimeout(() => setIdle(true), 1500)
    return () => clearTimeout(t)
  }, [idx, hints])

  const showHint = !result && (hints === 'always' || idle || missed !== false)
  const marks = showHint ? marksFor(km, stroke) : {}
  // In a layer drill the thumb key stays lit: holding it is the point of the exercise.
  if (thumbId && lesson.layer && !result) marks[thumbId] = { mark: 'hold', layer: lesson.layer }
  flash.apply(marks)

  function advance(hit: boolean) {
    if (hit) run.current.hits++
    if (idx + 1 < seq.length) return setIdx(idx + 1)
    const secs = (performance.now() - run.current.start) / 1000
    const total = run.current.hits + run.current.misses
    const acc = total ? run.current.hits / total : 1
    const per = run.current.hits ? (secs / run.current.hits).toFixed(1) : '–'
    record((s) => {
      const prev = s.lessons[lesson.id]
      s.lessons[lesson.id] = {
        runs: (prev?.runs ?? 0) + 1, bestWpm: prev?.bestWpm ?? 0,
        bestAcc: Math.max(prev?.bestAcc ?? 0, acc), lastAt: new Date().toISOString(),
      }
    })
    setResult({ speed: `${per} seconds per key`, acc })
  }

  return (
    <div className="drill" onClick={cap.focus}>
      <textarea
        ref={cap.ref}
        className="capture"
        aria-label="Press the key shown"
        onFocus={() => cap.setFocused(true)}
        onBlur={() => cap.setFocused(false)}
        onKeyDown={(e) => {
          if (result || !target) return
          e.preventDefault()
          if (e.repeat) return
          flash.press(e.nativeEvent, loc?.layer ?? 0)
          if (MODIFIER_CODES.test(e.code)) return
          if (!run.current.start) run.current.start = performance.now()
          const hit = e.code === target.code
          if (loc) record((s) => bump(s.keys, loc.id, !hit))
          if (hit) {
            advance(true)
          } else {
            run.current.misses++
            // Pressed the right physical key but on the base layer: the thumb key wasn't held.
            const k = loc && km.keys.find((x) => x.id === loc.id)
            const baseCode = k ? eventCodeOf(km.raw(0, k.row, k.col)) : undefined
            setMissed(
              loc && loc.layer > 0 && baseCode === e.code
                ? `Right key, but your ${thumbOf(km, loc.layer)} wasn’t down. Hold it, then press the key.`
                : 'Not that one. The key to press is highlighted.',
            )
            flash.miss()
          }
        }}
      />
      {result ? (
        <Done result={result} onAgain={onAgain} onNext={onNext} hasNext={hasNext} />
      ) : (
        <div className={cap.focused ? 'prompt' : 'prompt blurred'}>
          <p className="line key-target">
            Press <kbd className={stroke ? `l${stroke.layer}` : ''}>{target?.label}</kbd>
          </p>
          <p className="next-line">Then {seq[idx + 1]?.label ?? 'you’re done'}</p>
          {!cap.focused && <p className="resume">Click here to keep going</p>}
        </div>
      )}
      <div className="hint-row" aria-live="polite">
        {!result && (showHint || lesson.layer) && stroke && stroke.layer > 0 && (
          <StrokeSteps km={km} strokes={[showHint ? stroke : { ...stroke, key: '' }]} active={0} />
        )}
        {!result && missed && <p className="note miss-note">{missed}</p>}
        {!result && !loc && target && <p className="note">{target.label} isn’t on your keymap.</p>}
        {!result && lesson.caution && <p className="note">{lesson.caution}</p>}
      </div>
      <Keyboard km={km} layer={lesson.layer ?? (showHint ? stroke?.layer ?? 0 : 0)} marks={marks} label="Keyboard showing the key to press" />
      <p className="counter">
        {Math.min(idx + 1, seq.length)} of {seq.length}
        {!result && (
          <button className="link" onClick={(e) => { e.stopPropagation(); advance(false); cap.focus() }}>
            Skip
          </button>
        )}
      </p>
    </div>
  )
}

export function Practice({ km, stats, setStats }: { km: Keymap; stats: Stats; setStats: Dispatch<SetStateAction<Stats>> }) {
  const LESSONS = useMemo(() => buildLessons(km), [km])
  const [lessonId, setLessonId] = useState(() => store('cornix-trainer:lesson', 'home'))
  const [hints, setHints] = useState<Hints>(() => store<Hints>('cornix-trainer:hints', 'always'))
  const [runKey, setRunKey] = useState(0)
  const statsRef = useRef(stats)
  statsRef.current = stats

  useEffect(() => put('cornix-trainer:lesson', lessonId), [lessonId])
  useEffect(() => put('cornix-trainer:hints', hints), [hints])

  const index = Math.max(0, LESSONS.findIndex((l) => l.id === lessonId))
  const lesson = LESSONS[index]
  const record: Record_ = (fn) => {
    const next = structuredClone(statsRef.current)
    fn(next)
    statsRef.current = next
    saveStats(next)
    setStats(next)
  }
  const go = (i: number) => {
    setLessonId(LESSONS[i].id)
    setRunKey((k) => k + 1)
  }
  const props = {
    km, hints, record, hasNext: index + 1 < LESSONS.length,
    onNext: () => go(index + 1), onAgain: () => setRunKey((k) => k + 1),
  }

  return (
    <div className="practice">
      <aside className="lessons">
        <h2>Lessons</h2>
        <ol>
          {LESSONS.map((l, i) => {
            const rec = stats.lessons[l.id]
            return (
              <li key={l.id}>
                <button className={i === index ? 'lesson active' : 'lesson'} aria-current={i === index} onClick={() => go(i)}>
                  <span className="lesson-title">{l.title}</span>
                  {rec && (
                    <span className="lesson-meta">
                      {l.kind === 'text' ? `${rec.bestWpm} wpm, ` : ''}
                      {Math.round(rec.bestAcc * 100)}%
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ol>
      </aside>
      <section className="stage">
        <div className="stage-head">
          <div>
            <h2>{lesson.title}</h2>
            <p className="summary">{lesson.summary}</p>
          </div>
          <label className="hints">
            Highlight the next key
            <select value={hints} onChange={(e) => setHints(e.target.value as Hints)}>
              <option value="always">Always</option>
              <option value="delay">After a pause</option>
              <option value="never">Only after a miss</option>
            </select>
          </label>
        </div>
        {lesson.kind === 'text' ? (
          <TextDrill key={`${lesson.id}:${runKey}`} lesson={lesson} {...props} />
        ) : (
          <KeyDrill key={`${lesson.id}:${runKey}`} lesson={lesson} {...props} />
        )}
      </section>
    </div>
  )
}
