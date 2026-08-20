import { useState } from 'react'
import type { FormEvent } from 'react'
import { Icon } from './Icon'
import { api } from '../services/api'
import type { User } from '../types'

type Props = {
  mode: 'login' | 'register'
  onModeChange: (mode: 'login' | 'register') => void
  onClose: () => void
  onUser: (user: User) => void
}

// Fixed left-to-right order (Entrar, then Cadastro) so the tabs never swap sides when the
// player switches between them — only the active/inactive styling and label change.
const TABS: [mode: 'login' | 'register', activeLabel: string, inactiveLabel: string][] = [
  ['login', 'Entrar', 'Entrar'],
  ['register', 'Cadastrar', 'Cadastro'],
]

// Formats digits into the Brazilian phone pattern as the player types — (DD) NNNNN-NNNN for an
// 11-digit mobile number, (DD) NNNN-NNNN for a 10-digit landline — and drops anything that
// isn't a digit, so pasted text with spaces/dashes/letters comes out clean either way.
function formatPhoneBR(raw: string) {
  const digits = raw.replace(/\D/g, '').slice(0, 11)
  if (!digits) return ''
  const ddd = digits.slice(0, 2)
  if (digits.length <= 2) return `(${ddd}`
  const rest = digits.slice(2)
  if (rest.length <= 4) return `(${ddd}) ${rest}`
  const splitAt = digits.length <= 10 ? 4 : 5
  return `(${ddd}) ${rest.slice(0, splitAt)}-${rest.slice(splitAt)}`
}

export function AuthModal({ mode, onModeChange, onClose, onUser }: Props) {
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(''); setLoading(true)
    const form = new FormData(event.currentTarget)
    try {
      const username = String(form.get('username') || '')
      const password = String(form.get('password') || '')
      const data = mode === 'register'
        ? await api.register({ username, password, phone: String(form.get('phone') || ''), name: String(form.get('name') || '') })
        : await api.login({ username, password }, form.get('rememberMe') === 'on')
      onUser(data.user)
    } catch (err) { setError(err instanceof Error ? err.message : 'Erro inesperado.') } finally { setLoading(false) }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section className="modal-card auth-card" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className={`auth-card__banner auth-card__banner--${mode}`} aria-hidden="true" />

        <header className="auth-card__head">
          <div className="auth-card__tabs" role="tablist" aria-label="Acesso à conta">
            {TABS.map(([tabMode, activeLabel, inactiveLabel]) => (
              <button
                key={tabMode}
                type="button"
                role="tab"
                aria-selected={tabMode === mode}
                className={tabMode === mode ? 'auth-pill auth-pill--active' : 'auth-pill'}
                onClick={() => { onModeChange(tabMode); setError('') }}
              >
                {tabMode === mode ? activeLabel : inactiveLabel}
              </button>
            ))}
          </div>
          <button type="button" className="modal-close auth-card__close" aria-label="Fechar" onClick={onClose}><Icon name="close" size={16} /></button>
        </header>

        <div className="auth-heading">
          <h1>{mode === 'login' ? 'Acesse sua conta' : 'Crie sua conta'}</h1>
          <p>{mode === 'login' ? 'Jogue e ganhe no Space Adventure' : 'Cadastre-se e comece a jogar'}</p>
        </div>

        <form className="auth-form" key={mode} onSubmit={submit}>
          <span className="auth-input"><Icon name="user" size={16} /><input name="username" minLength={3} maxLength={32} required autoComplete="username" placeholder="Nome de Usuário" /></span>
          {mode === 'register' && (
            <span className="auth-input">
              <Icon name="phone" size={16} />
              <input
                name="phone" type="tel" inputMode="numeric" required autoComplete="tel" placeholder="Telefone" maxLength={16}
                onChange={(e) => { e.target.value = formatPhoneBR(e.target.value) }}
              />
            </span>
          )}
          <span className="auth-input">
            <Icon name="lock" size={16} />
            <input name="password" type={showPassword ? 'text' : 'password'} minLength={6} required autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder={mode === 'register' ? 'Senha (mín. 6 caracteres)' : 'Sua senha'} />
            <button type="button" className="auth-input__eye" aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setShowPassword((v) => !v)}>
              <Icon name={showPassword ? 'eye-off' : 'eye'} size={16} />
            </button>
          </span>
          {mode === 'register' && (
            <span className="auth-input"><Icon name="check" size={16} /><input name="name" minLength={2} required autoComplete="name" placeholder="Nome ou Apelido" /></span>
          )}
          {mode === 'login' && (
            <label className="auth-checkbox">
              <input type="checkbox" name="rememberMe" defaultChecked /> Lembrar de mim
            </label>
          )}
          {error && <p className="form-error" role="alert">{error}</p>}
          <button type="submit" className="primary-button auth-form__submit" disabled={loading}>{loading ? 'Aguarde…' : mode === 'login' ? 'Entrar' : 'Criar conta'}</button>
        </form>

        <p className="auth-switch">
          {mode === 'login' ? 'Não tem conta? ' : 'Já tem conta? '}
          <button type="button" onClick={() => { onModeChange(mode === 'login' ? 'register' : 'login'); setError('') }}>
            {mode === 'login' ? 'Criar agora' : 'Entrar agora'}
          </button>
        </p>
      </section>
    </div>
  )
}
