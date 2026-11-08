// Per-viewer progress, kept in localStorage. Everything still works if storage is unavailable.

export type Tally = { n: number; miss: number }
export type LessonRecord = { runs: number; bestWpm: number; bestAcc: number; lastAt: string }
export type Stats = {
  chars: Record<string, Tally>
  keys: Record<string, Tally> // physical key id -> tally
  lessons: Record<string, LessonRecord>
}

const KEY = 'cornix-trainer:stats:v1'
const empty = (): Stats => ({ chars: {}, keys: {}, lessons: {} })

export function loadStats(): Stats {
  try {
    const s = localStorage.getItem(KEY)
    return s ? { ...empty(), ...JSON.parse(s) } : empty()
  } catch {
    return empty()
  }
}

export function saveStats(s: Stats) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* storage blocked: progress is kept for this session only */
  }
}

export function resetStats(): Stats {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
  return empty()
}

export function bump(t: Record<string, Tally>, k: string, miss: boolean) {
  const cur = t[k] ?? { n: 0, miss: 0 }
  t[k] = { n: cur.n + 1, miss: cur.miss + (miss ? 1 : 0) }
}

export function store<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return v ? (JSON.parse(v) as T) : fallback
  } catch {
    return fallback
  }
}

export function put(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v))
  } catch {
    /* ignore */
  }
}
