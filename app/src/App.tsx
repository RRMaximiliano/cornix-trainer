import { useEffect, useMemo, useState } from 'react'
import { buildKeymap, type KeymapFile } from './lib/keymap'
import { connect, isConnected, onConnectionChange, readLayers, webHidSupported } from './lib/webhid'
import { loadStats, put, store, type Stats } from './lib/stats'
import { Practice } from './components/Practice'
import { Explore } from './components/Explore'
import { Progress } from './components/Progress'

type Tab = 'practice' | 'explore' | 'progress'
const TABS: { id: Tab; label: string }[] = [
  { id: 'practice', label: 'Practice' },
  { id: 'explore', label: 'Explore the layout' },
  { id: 'progress', label: 'Progress' },
]
const LAYERS_KEY = 'cornix-trainer:layers:v1'

function when(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function App() {
  const [file, setFile] = useState<KeymapFile | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [tab, setTab] = useState<Tab>(() => {
    const fromHash = location.hash.slice(1) as Tab
    return TABS.some((t) => t.id === fromHash) ? fromHash : store<Tab>('cornix-trainer:tab', 'practice')
  })
  const [stats, setStats] = useState<Stats>(loadStats)
  const [connected, setConnected] = useState(isConnected)

  useEffect(() => {
    const off = onConnectionChange(setConnected)
    connect(false).catch(() => undefined) // reuse an earlier permission without prompting
    return () => {
      off()
    }
  }, [])

  useEffect(() => {
    fetch('/keymap.json')
      .then((r) => {
        if (!r.ok) throw new Error('keymap.json is missing. Run npm run sync with the Cornix connected.')
        return r.json() as Promise<KeymapFile>
      })
      .then((f) => {
        const saved = store<{ at: string; layers: number[][][] } | null>(LAYERS_KEY, null)
        setFile(saved && new Date(saved.at) > new Date(f.exportedAt) ? { ...f, layers: saved.layers, exportedAt: saved.at } : f)
      })
      .catch((e: Error) => setError(e.message))
  }, [])

  useEffect(() => {
    put('cornix-trainer:tab', tab)
    history.replaceState(null, '', `#${tab}`)
  }, [tab])

  const km = useMemo(() => (file ? buildKeymap(file) : null), [file])

  async function sync() {
    if (!file) return
    setSyncing(true)
    setError(null)
    try {
      const layers = await readLayers(file.matrix.rows, file.matrix.cols)
      const at = new Date().toISOString()
      put(LAYERS_KEY, { at, layers })
      setFile({ ...file, layers, exportedAt: at })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="app">
      <header className="masthead">
        <div className="brand">
          <h1>Cornix trainer</h1>
          <p>Learn your split keyboard one layer at a time.</p>
        </div>
        <nav className="tabs" aria-label="Sections">
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? 'tab active' : 'tab'} aria-current={tab === t.id} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
        <div className="sync">
          {file && <span>Keymap from {when(file.exportedAt)}</span>}
          {webHidSupported() && file && (
            <button className="link" onClick={sync} disabled={syncing}>
              {syncing ? 'Reading…' : 'Read again from keyboard'}
            </button>
          )}
          {webHidSupported() &&
            (connected ? (
              <span title="The app asks the Cornix which key you pressed, so the left and right Space keys and the one-shot keys light up correctly.">
                Connected: exact key tracking on
              </span>
            ) : (
              <button
                className="link"
                title="Lets the app tell the left and right Space keys and the one-shot keys apart."
                onClick={() => connect(true).catch((e: Error) => setError(e.message))}
              >
                Connect keyboard for exact key tracking
              </button>
            ))}
        </div>
      </header>

      {error && <p className="error" role="alert">{error}</p>}

      {km && (
        <main>
          {tab === 'practice' && <Practice km={km} stats={stats} setStats={setStats} />}
          {tab === 'explore' && <Explore km={km} />}
          {tab === 'progress' && <Progress km={km} stats={stats} setStats={setStats} />}
        </main>
      )}
    </div>
  )
}
