import type { Dispatch, SetStateAction } from 'react'
import { Keyboard } from './Keyboard'
import { buildLessons } from '../lib/lessons'
import type { Keymap } from '../lib/keymap'
import { resetStats, type Stats } from '../lib/stats'

export function Progress({ km, stats, setStats }: { km: Keymap; stats: Stats; setStats: Dispatch<SetStateAction<Stats>> }) {
  const heat: Record<string, number> = {}
  for (const [id, t] of Object.entries(stats.keys)) if (t.n >= 3) heat[id] = t.miss / t.n

  const hardest = Object.entries(stats.chars)
    .filter(([, t]) => t.n >= 5 && t.miss > 0)
    .map(([ch, t]) => ({ ch, rate: t.miss / t.n, n: t.n }))
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 8)

  const totalChars = Object.values(stats.chars).reduce((a, t) => a + t.n, 0)

  return (
    <div className="progress">
      <div className="explore-head">
        <p className="summary">
          {totalChars
            ? `Keys you miss most are shaded red. You've typed ${totalChars.toLocaleString()} characters so far.`
            : 'Finish a lesson and the keys you miss most will be shaded red here.'}
        </p>
      </div>
      <Keyboard km={km} layer={0} heat={heat} label="Keyboard shaded by how often each key is missed" />
      <div className="explore-grid">
        <section className="panel wide">
          <h3>Lessons</h3>
          <table className="table">
            <thead>
              <tr><th>Lesson</th><th>Times done</th><th>Best speed</th><th>Best accuracy</th></tr>
            </thead>
            <tbody>
              {buildLessons(km).map((l) => {
                const r = stats.lessons[l.id]
                return (
                  <tr key={l.id} className={r ? '' : 'muted'}>
                    <td>{l.title}</td>
                    <td>{r?.runs ?? 0}</td>
                    <td>{r && l.kind === 'text' ? `${r.bestWpm} wpm` : '–'}</td>
                    <td>{r ? `${Math.round(r.bestAcc * 100)}%` : '–'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
        <section className="panel">
          <h3>Characters to work on</h3>
          {hardest.length ? (
            <ul className="hardest">
              {hardest.map((h) => (
                <li key={h.ch}>
                  <kbd>{h.ch === ' ' ? 'Space' : h.ch}</kbd>
                  <span>missed {Math.round(h.rate * 100)}% of {h.n} tries</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Nothing yet. Characters show up here once you've typed each one at least five times.</p>
          )}
          <button
            className="btn"
            onClick={() => {
              if (confirm('Erase all your progress? This cannot be undone.')) setStats(resetStats())
            }}
          >
            Erase progress
          </button>
        </section>
      </div>
    </div>
  )
}
