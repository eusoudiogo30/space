import { useEffect, useState } from 'react'
import { api } from '../services/api'
import type { RankingEntry } from '../types'

const fallback: RankingEntry[] = [
  { position: 1, name: 'Bia Relâmpago', score: 2840 },
  { position: 2, name: 'Pato Ninja', score: 2510 },
  { position: 3, name: 'Leo Turbo', score: 2290 },
  { position: 4, name: 'Malu', score: 1980 },
  { position: 5, name: 'Capitão Quack', score: 1740 },
]

export function RankingPage({ onBack }: { onBack: () => void }) {
  const [period, setPeriod] = useState<'daily' | 'weekly'>('daily')
  const [ranking, setRanking] = useState(fallback)
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    setLoading(true)
    api.ranking(period).then((data) => setRanking(data.ranking)).catch(() => setRanking(fallback)).finally(() => setLoading(false))
  }, [period])
  return (
    <main className="page inner-page">
      <header className="page-header"><button className="icon-button" onClick={onBack}>←</button><h2>Ranking</h2><span /></header>
      <div className="tabs">
        <button className={period === 'daily' ? 'active' : ''} onClick={() => setPeriod('daily')}>Hoje</button>
        <button className={period === 'weekly' ? 'active' : ''} onClick={() => setPeriod('weekly')}>Esta semana</button>
      </div>
      {loading && <p className="loading">Atualizando classificação…</p>}
      <ol className="ranking-list">
        {ranking.map((entry) => <li key={`${entry.position}-${entry.name}`} className={entry.position <= 3 ? 'podium' : ''}>
          <span className={`rank ${entry.position <= 3 ? `rank--${entry.position}` : ''}`}>{entry.position}</span>
          <span className="avatar">{entry.name.slice(0, 1)}</span>
          <strong>{entry.name}</strong><b>{entry.score} pts</b>
        </li>)}
      </ol>
    </main>
  )
}
