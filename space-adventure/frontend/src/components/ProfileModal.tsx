import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Icon } from './Icon'
import { api } from '../services/api'
import type { MySummary, User } from '../types'

type FieldKey = 'name' | 'username' | 'document' | 'password'

function formatDocument(value: string | null | undefined) {
  const digits = (value || '').replace(/\D/g, '')
  if (digits.length !== 11) return value || ''
  return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
}

export function ProfileModal({ user, onClose, onUser }: { user: User; onClose: () => void; onUser: (user: User) => void }) {
  const [summary, setSummary] = useState<MySummary | null>(null)
  const [editing, setEditing] = useState<FieldKey | null>(null)
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { api.mySummary().then(setSummary).catch(() => {}) }, [])

  const save = async (event: FormEvent<HTMLFormElement>, field: FieldKey) => {
    event.preventDefault()
    setSaving(true); setMessage('')
    const form = new FormData(event.currentTarget)
    try {
      const payload = field === 'password'
        ? { currentPassword: String(form.get('currentPassword') || ''), newPassword: String(form.get('newPassword') || '') }
        : { [field]: String(form.get(field) || '') }
      const { user: updated } = await api.updateMe(payload)
      onUser(updated)
      setEditing(null)
      setMessage('Salvo com sucesso.')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Não foi possível salvar.')
    } finally {
      setSaving(false)
    }
  }

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
            {editing === 'name' ? (
              <form className="profile-field__edit" onSubmit={(e) => save(e, 'name')}>
                <input name="name" defaultValue={user.name} minLength={2} required autoFocus />
                <button className="primary-button tiny" disabled={saving}>Salvar</button>
                <button type="button" className="ghost-button tiny" onClick={() => setEditing(null)}>Cancelar</button>
              </form>
            ) : (
              <div className="profile-field__view">
                <input value={user.name} disabled readOnly />
                <button type="button" className="primary-button" onClick={() => setEditing('name')}>Editar</button>
              </div>
            )}
          </div>

          <div className="profile-field">
            <label>Nome de usuário</label>
            {editing === 'username' ? (
              <form className="profile-field__edit" onSubmit={(e) => save(e, 'username')}>
                <input name="username" defaultValue={user.username || ''} minLength={3} maxLength={32} required autoFocus />
                <button className="primary-button tiny" disabled={saving}>Salvar</button>
                <button type="button" className="ghost-button tiny" onClick={() => setEditing(null)}>Cancelar</button>
              </form>
            ) : (
              <div className="profile-field__view">
                <input value={user.username || ''} disabled readOnly />
                <button type="button" className="primary-button" onClick={() => setEditing('username')}>Editar</button>
              </div>
            )}
          </div>

          <div className="profile-field">
            <label>Documento</label>
            {editing === 'document' ? (
              <form className="profile-field__edit" onSubmit={(e) => save(e, 'document')}>
                <input name="document" defaultValue={user.document || ''} placeholder="000.000.000-00" required autoFocus />
                <button className="primary-button tiny" disabled={saving}>Salvar</button>
                <button type="button" className="ghost-button tiny" onClick={() => setEditing(null)}>Cancelar</button>
              </form>
            ) : (
              <div className="profile-field__view">
                <input value={user.document ? formatDocument(user.document) : ''} placeholder="Não informado" disabled readOnly />
                <button type="button" className="primary-button" onClick={() => setEditing('document')}>Editar</button>
              </div>
            )}
          </div>

          <div className="profile-field">
            <label>Senha</label>
            {editing === 'password' ? (
              <form className="profile-field__edit profile-field__edit--password" onSubmit={(e) => save(e, 'password')}>
                <input name="currentPassword" type="password" placeholder="Senha atual" required autoFocus />
                <input name="newPassword" type="password" placeholder="Nova senha (mín. 6)" minLength={6} required />
                <div className="profile-field__edit-actions">
                  <button className="primary-button tiny" disabled={saving}>Salvar</button>
                  <button type="button" className="ghost-button tiny" onClick={() => setEditing(null)}>Cancelar</button>
                </div>
              </form>
            ) : (
              <div className="profile-field__view">
                <input value="••••••••" disabled readOnly />
                <button type="button" className="primary-button" onClick={() => setEditing('password')}>Editar</button>
              </div>
            )}
          </div>
        </div>
        {message && <p className="save-message">{message}</p>}
      </section>
    </div>
  )
}
