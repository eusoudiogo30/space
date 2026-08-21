import { useEffect, useState } from 'react'
import { Icon } from './Icon'
import { api } from '../services/api'
import type { MySummary, User } from '../types'

function formatDocument(value: string | null | undefined) {
  const digits = (value || '').replace(/\D/g, '')
  if (digits.length !== 11) return value || ''
  return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
}

function formatPhone(value: string | null | undefined) {
  const digits = (value || '').replace(/\D/g, '')
  if (digits.length === 11) return digits.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')
  if (digits.length === 10) return digits.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3')
  return value || ''
}

export function ProfileModal({ user, onClose }: { user: User; onClose: () => void }) {
  const [summary, setSummary] = useState<MySummary | null>(null)

  useEffect(() => { api.mySummary().then(setSummary).catch(() => {}) }, [])

  const stats = [
    { key: 'deposited', label: 'Total Depositado', value: summary?.totalDeposited ?? 0, positive: true },
    { key: 'withdrawn', label: 'Total Retirado', value: summary?.totalWithdrawn ?? 0, positive: false },
    { key: 'won', label: 'Ganho em Jogadas', value: summary?.totalWon ?? 0, positive: true },
  ] as const

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section className="modal-card profile-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-close" aria-label="Fechar" onClick={onClose}><Icon name="close" size={16} /></button>
        <h1>Meu perfil</h1>

        <h2 className="profile-modal__section">Estatísticas</h2>
        <div className="profile-stats">
          {stats.map((s) => (
            <div className="profile-stats__row" key={s.key}>
              <div>
                <small>{s.label}</small>
                <b className={s.positive ? 'positive-value' : ''}>R$ {(s.value / 100).toFixed(2).replace('.', ',')}</b>
              </div>
              <span className="profile-stats__icon"><Icon name={s.key === 'won' ? 'flame' : s.key === 'withdrawn' ? 'cashout' : 'wallet'} size={18} /></span>
            </div>
          ))}
        </div>

        <h2 className="profile-modal__section">Informações pessoais</h2>
        <div className="profile-fields">
          <div className="profile-field">
            <label>Nome</label>
            <div className="profile-field__view"><input value={user.name} disabled readOnly /></div>
          </div>

          <div className="profile-field">
            <label>Nome de usuário</label>
            <div className="profile-field__view"><input value={user.username || ''} disabled readOnly /></div>
          </div>

          <div className="profile-field">
            <label>Telefone</label>
            <div className="profile-field__view"><input value={formatPhone(user.phone)} placeholder="Não informado" disabled readOnly /></div>
          </div>

          <div className="profile-field">
            <label>Documento</label>
            <div className="profile-field__view"><input value={user.document ? formatDocument(user.document) : ''} placeholder="Não informado" disabled readOnly /></div>
          </div>

          <div className="profile-field">
            <label>E-mail</label>
            <div className="profile-field__view"><input value={user.email || ''} placeholder="Não informado" disabled readOnly /></div>
          </div>
        </div>
      </section>
    </div>
  )
}
