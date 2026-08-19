import { Icon, type IconName } from './Icon'
import type { User } from '../types'

type Item = { icon: IconName; label: string; hint: string; onClick: () => void; danger?: boolean }

type Props = {
  user: User
  onClose: () => void
  onHome: () => void
  onProfile: () => void
  onReferral: () => void
  onLogout: () => void
}

export function ProfileMenu({ user, onClose, onHome, onProfile, onReferral, onLogout }: Props) {
  const run = (action: () => void) => { action(); onClose() }
  const items: Item[] = [
    { icon: 'home', label: 'Visão Geral', hint: 'Página inicial', onClick: () => run(onHome) },
    { icon: 'user', label: 'Perfil', hint: 'Saldos e histórico', onClick: () => run(onProfile) },
    { icon: 'users', label: 'Indicações', hint: 'Convide e ganhe', onClick: () => run(onReferral) },
  ]

  return (
    <div className="profile-menu-backdrop" role="presentation" onClick={onClose}>
      <section className="profile-menu" role="menu" onClick={(e) => e.stopPropagation()}>
        <header className="profile-menu__head">
          <span className="profile-menu__avatar">{(user.username || user.name || '?').slice(0, 1).toUpperCase()}</span>
          <div>
            <b>{user.username || user.name}</b>
            <small>Bem-vindo de volta!</small>
          </div>
          <i className="profile-menu__online" aria-hidden="true" />
        </header>
        <nav>
          {items.map((item) => (
            <button key={item.label} type="button" className="profile-menu__item" onClick={item.onClick}>
              <span className="profile-menu__icon"><Icon name={item.icon} size={17} /></span>
              <span className="profile-menu__text"><b>{item.label}</b><small>{item.hint}</small></span>
              <Icon name="chevron-right" size={15} />
            </button>
          ))}
        </nav>
        <button type="button" className="profile-menu__item profile-menu__item--danger" onClick={() => run(onLogout)}>
          <span className="profile-menu__icon"><Icon name="logout" size={17} /></span>
          <span className="profile-menu__text"><b>Sair da conta</b></span>
        </button>
      </section>
    </div>
  )
}
