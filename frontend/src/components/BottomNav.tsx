import { Icon } from './Icon'

type Props = {
  active: 'home' | 'ranking' | 'account'
  onHome: () => void
  onRanking: () => void
  onPlay: () => void
  onDeposit: () => void
  onProfile: () => void
}

export function BottomNav({ active, onHome, onRanking, onPlay, onDeposit, onProfile }: Props) {
  return (
    <nav className="bottom-nav" aria-label="Navegação principal">
      <button className={`bottom-nav__item ${active === 'home' ? 'active' : ''}`} onClick={onHome}>
        <Icon name="home" size={19} />Início
      </button>
      <button className={`bottom-nav__item ${active === 'ranking' ? 'active' : ''}`} onClick={onRanking}>
        <Icon name="trophy" size={19} />Ranking
      </button>
      <button className="bottom-nav__play" onClick={onPlay} aria-label="Jogar"><Icon name="target" size={24} /></button>
      <button className="bottom-nav__item" onClick={onDeposit}>
        <Icon name="wallet" size={19} />Depósito
      </button>
      <button className={`bottom-nav__item ${active === 'account' ? 'active' : ''}`} onClick={onProfile}>
        <Icon name="user" size={19} />Perfil
      </button>
    </nav>
  )
}
