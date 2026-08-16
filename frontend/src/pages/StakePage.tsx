import { useState } from 'react'
import type { User } from '../types'

export function StakePage({ user, onStart, onBack }: { user: User | null; onStart: (amount: number) => void; onBack: () => void }) {
  const options = [10, 25, 50, 100, 250, 500]
  const [amount, setAmount] = useState(50)
  return <main className="page inner-page stake-page">
    <header className="page-header"><button className="icon-button" onClick={onBack}>←</button><h2>Entrada da rodada</h2><span /></header>
    <div className="auth-mascot">🦆</div>
    <p className="demo-banner"><b>Ambiente demonstrativo</b><br/>Nenhuma transação bancária é realizada.</p>
    <section className="stake-card"><small>Escolha o valor da entrada</small><strong>R$ {amount.toFixed(2).replace('.', ',')}</strong>
      <div>{options.map(value => <button className={amount === value ? 'active' : ''} key={value} onClick={() => setAmount(value)}>R$ {value}</button>)}</div>
    </section>
    <p className="stake-balance">Saldo disponível: <b>R$ {((user?.coinBalance ?? 0) / 100).toFixed(2).replace('.', ',')}</b></p>
    <div className="multiplier-info"><span>🦆 <b>+10</b></span><span>🦉 <b>+50</b></span><span>🌟 <b>+100</b></span><span>💣 <b>−30</b></span></div>
    <button className="primary-button" disabled={Boolean(user && user.coinBalance < amount * 100)} onClick={() => onStart(amount)}>Começar rodada</button>
  </main>
}
