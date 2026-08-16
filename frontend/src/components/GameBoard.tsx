import type { Target } from '../types'
import { Character } from './Character'

export function GameBoard({ target, onHit }: { target: Target | null; onHit: () => void }) {
  return (
    <div className="game-arena">
      <div className="arena-sign"><span>🪷</span><b>LAGOA DOS PATOS</b><span>🪷</span></div>
      <div className="game-board" aria-label="Tabuleiro com nove buracos">
        {Array.from({ length: 9 }, (_, hole) => (
          <button
            className={`hole ${target?.hole === hole ? 'hole--active' : ''}`}
            disabled={target?.hole !== hole}
            key={hole}
            onPointerDown={target?.hole === hole ? onHit : undefined}
            aria-label={target?.hole === hole ? 'Acertar personagem' : `Buraco ${hole + 1} vazio`}
          >
            <span className="hole__soil" />
            <span className="hole__back" />
            {target?.hole === hole && <Character type={target.type} />}
            <span className="hole__front" />
          </button>
        ))}
      </div>
    </div>
  )
}
