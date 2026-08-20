import { useState } from 'react'

export function TutorialPage({ onContinue }: { onContinue: (dontShowAgain: boolean) => void }) {
  const [dontShow, setDontShow] = useState(false)

  return (
    <main className="page tutorial-page starfield">
      <div className="tutorial-card">
        <img src="/game/ship.png" alt="" className="tutorial-ship" />
        <h1>Como jogar</h1>
        <p className="tutorial-lead">Arraste o dedo pela tela para pilotar a nave livremente, em qualquer direção.</p>

        <ul className="tutorial-list">
          <li>
            <img src="/game/coin.svg" alt="" />
            <div><strong>Moeda</strong><span>Aumenta o valor do seu resgate</span></div>
          </li>
          <li>
            <img src="/game/boost.svg" alt="" />
            <div><strong>Boost</strong><span>3 segundos invencível a pedras</span></div>
          </li>
          <li>
            <img src="/game/gem-gold.svg" alt="" />
            <div><strong>Cometa raro</strong><span>Vale o triplo de uma moeda no seu resgate</span></div>
          </li>
          <li>
            <img src="/game/rock-1.svg" alt="" />
            <div><strong>Pedra</strong><span>Encerra o voo — resgate antes de bater!</span></div>
          </li>
        </ul>

        <label className="tutorial-checkbox">
          <input type="checkbox" checked={dontShow} onChange={(e) => setDontShow(e.target.checked)} />
          Não mostrar novamente
        </label>

        <button className="primary-button" style={{ width: '100%' }} onClick={() => onContinue(dontShow)}>
          Entendi, jogar!
        </button>
      </div>
    </main>
  )
}
