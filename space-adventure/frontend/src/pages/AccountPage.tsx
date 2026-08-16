import { useState } from 'react'
import type { FormEvent } from 'react'
import { Icon } from '../components/Icon'
import { api } from '../services/api'
import type { User } from '../types'

export function AccountPage({ user, onUser, onBack }: { user: User | null; onUser: (user: User | null) => void; onBack: () => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [topUpMessage, setTopUpMessage] = useState('')

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(''); setLoading(true)
    const form = new FormData(event.currentTarget)
    try {
      const payload = { name: String(form.get('name') || ''), email: String(form.get('email')), password: String(form.get('password')) }
      const data = mode === 'register' ? await api.register(payload) : await api.login(payload)
      onUser(data.user)
    } catch (err) { setError(err instanceof Error ? err.message : 'Erro inesperado.') } finally { setLoading(false) }
  }

  const topUp = async () => {
    setTopUpMessage('Adicionando...')
    try {
      await api.demoCredits('ADD', 1000)
      const { user: updated } = await api.me()
      onUser(updated)
      setTopUpMessage('Saldo demo atualizado.')
    } catch (err) {
      setTopUpMessage(err instanceof Error ? err.message : 'Não foi possível adicionar saldo.')
    }
  }

  if (user) return (
    <main className="page inner-page starfield">
      <header className="page-header"><button className="icon-button" onClick={onBack}>←</button><h2>Meu perfil</h2><span /></header>
      <section className="profile-card">
        <div className="big-avatar">{user.name[0]}</div>
        <h3>{user.name}</h3>
        <p>{user.email}</p>
        <div>
          <span><b>R$ {(user.coins / 100).toFixed(2).replace('.', ',')}</b><small> saldo</small></span>
          <span>🏆 <b>{user.bestScore}</b><small> recorde</small></span>
        </div>
      </section>
      <button className="secondary-button" onClick={() => void topUp()}>+ Adicionar saldo demo (R$ 10,00)</button>
      {topUpMessage && <p style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: 12, marginBottom: 12 }}>{topUpMessage}</p>}
      <button className="secondary-button" onClick={() => { api.logout(); onUser(null) }}>Sair da conta</button>
    </main>
  )

  return (
    <main className="page inner-page auth-page starfield">
      <header className="page-header"><button className="icon-button" onClick={onBack}>←</button><h2>{mode === 'login' ? 'Entrar' : 'Criar conta'}</h2><span /></header>
      <section className="auth-card">
        <div className="auth-glow" aria-hidden="true" />
        <div className="auth-mascot"><img src="/game/ship.png" alt="" /></div>
        <div className="auth-heading">
          <h1>{mode === 'login' ? 'Bem-vindo de volta!' : 'Crie sua conta'}</h1>
          <p>{mode === 'login' ? 'Entre para decolar e disputar o ranking.' : 'Cadastre-se para pilotar e guardar seu histórico.'}</p>
        </div>
        <div className="auth-tabs" role="tablist" aria-label="Acesso à conta">
          <span className={`auth-tabs__indicator ${mode === 'register' ? 'auth-tabs__indicator--right' : ''}`} aria-hidden="true" />
          <button type="button" role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setError('') }}>Entrar</button>
          <button type="button" role="tab" aria-selected={mode === 'register'} className={mode === 'register' ? 'active' : ''} onClick={() => { setMode('register'); setError('') }}>Cadastro</button>
        </div>
        <form className="auth-form" key={mode} onSubmit={submit}>
          {mode === 'register' && (
            <label>
              Nome
              <span className="auth-input"><Icon name="user" size={16} /><input name="name" minLength={2} required autoComplete="name" placeholder="Como quer ser chamado?" /></span>
            </label>
          )}
          <label>
            E-mail
            <span className="auth-input"><Icon name="mail" size={16} /><input name="email" type="email" required autoComplete="email" inputMode="email" placeholder="voce@exemplo.com" /></span>
          </label>
          <label>
            Senha
            <span className="auth-input"><Icon name="lock" size={16} /><input name="password" type="password" minLength={8} required autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder="Mínimo 8 caracteres" /></span>
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button type="submit" className="primary-button" disabled={loading}>{loading ? 'Aguarde…' : mode === 'login' ? 'Entrar e voar' : 'Criar minha conta'}</button>
        </form>
      </section>
    </main>
  )
}
