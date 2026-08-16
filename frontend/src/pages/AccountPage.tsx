import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Icon } from '../components/Icon'
import { api } from '../services/api'
import type { GameHistory, User } from '../types'

type Props = {
  user: User | null
  onUser: (user: User | null) => void
  onBack: () => void
  autoOpenDeposit?: boolean
  onAutoOpenHandled?: () => void
}

export function AccountPage({ user, onUser, onBack, autoOpenDeposit, onAutoOpenHandled }: Props) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState<GameHistory[]>([])
  const [depositOpen, setDepositOpen] = useState(false)
  const [withdrawOpen, setWithdrawOpen] = useState(false)
  const [referralOpen, setReferralOpen] = useState(false)
  const [depositStep, setDepositStep] = useState<'amount' | 'generating' | 'pix'>('amount')
  const [depositAmount, setDepositAmount] = useState(50)
  const [customAmount, setCustomAmount] = useState('')
  const [copied, setCopied] = useState(false)
  const [depositError, setDepositError] = useState('')
  const [pixData, setPixData] = useState<{ id: string; qrImage: string | null; copyPaste: string } | null>(null)
  const [depositConfirmed, setDepositConfirmed] = useState(false)
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [withdrawDocument, setWithdrawDocument] = useState('')
  const [withdrawKey, setWithdrawKey] = useState('')
  const [withdrawType, setWithdrawType] = useState<'EMAIL'|'CPF'|'CNPJ'|'PHONE'|'EVP'>('EMAIL')
  const [withdrawMessage, setWithdrawMessage] = useState('')
  const [withdrawing, setWithdrawing] = useState(false)
  useEffect(() => { if (user) api.history().then((data) => setHistory(data.games)).catch(() => undefined) }, [user])
  useEffect(() => {
    if (!pixData || depositConfirmed) return
    const interval = window.setInterval(() => {
      api.getDeposit(pixData.id).then(({ deposit }) => {
        if (deposit.status !== 'CONFIRMED') return
        setDepositConfirmed(true)
        return api.me().then(({ user: updatedUser }) => onUser(updatedUser))
      }).catch(() => undefined)
    }, 5000)
    return () => window.clearInterval(interval)
  }, [depositConfirmed, onUser, pixData])
  const chosenAmount = customAmount ? Number(customAmount.replace(',', '.')) : depositAmount
  const pixCode = pixData?.copyPaste ?? ''
  const referralCode = user ? `PATO-${user.id.slice(0, 6).toUpperCase()}` : ''
  const referralLink = `${window.location.origin}/?ref=${referralCode}`
  const totalHits = history.reduce((total, game) => total + game.hits, 0)
  const openDeposit = () => { setDepositStep('amount'); setCopied(false); setDepositError(''); setDepositConfirmed(false); setPixData(null); setDepositOpen(true) }
  useEffect(() => {
    if (user && autoOpenDeposit) { openDeposit(); onAutoOpenHandled?.() }
  }, [user, autoOpenDeposit])
  const generatePix = async () => {
    if (!Number.isFinite(chosenAmount) || chosenAmount < 10) return
    setDepositError('')
    setDepositStep('generating')
    try {
      const { deposit } = await api.createDeposit(chosenAmount)
      if (!deposit.copyPaste) throw new Error('O gateway não retornou o código Pix.')
      setPixData({ id: deposit.id, qrImage: deposit.qrImage, copyPaste: deposit.copyPaste })
      setDepositStep('pix')
    } catch (err) {
      setDepositError(err instanceof Error ? err.message : 'Não foi possível gerar o Pix.')
      setDepositStep('amount')
    }
  }
  const copyPix = async () => {
    await navigator.clipboard.writeText(pixCode)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }
  const copyReferral = async () => {
    await navigator.clipboard.writeText(referralLink)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }
  const requestWithdrawal = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setWithdrawMessage(''); setWithdrawing(true)
    try {
      const amount = Number(withdrawAmount.replace(',', '.'))
      const { withdrawal } = await api.requestWithdrawal({ amount, document: withdrawDocument, pixKey: withdrawKey, pixType: withdrawType })
      const { user: updatedUser } = await api.me(); onUser(updatedUser)
      setWithdrawMessage(`Saque enviado à Zypher com status ${withdrawal.status}.`)
    } catch (err) { setWithdrawMessage(err instanceof Error ? err.message : 'Não foi possível solicitar o saque.') } finally { setWithdrawing(false) }
  }
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(''); setLoading(true)
    const form = new FormData(event.currentTarget)
    try {
      const payload = { name: String(form.get('name') || ''), email: String(form.get('email')), password: String(form.get('password')) }
      const data = mode === 'register' ? await api.register(payload) : await api.login(payload)
      onUser(data.user)
    } catch (err) { setError(err instanceof Error ? err.message : 'Erro inesperado.') } finally { setLoading(false) }
  }
  if (user) return (
    <main className="page inner-page">
      <header className="page-header"><button className="icon-button" onClick={onBack}>←</button><h2>Meu perfil</h2><span /></header>
      <section className="profile-card"><div className="big-avatar">{user.name[0]}</div><h3>{user.name}</h3><p>{user.email}</p>
        <div><span><b>R$ {(user.coinBalance / 100).toFixed(2).replace('.', ',')}</b><small> saldo</small></span><span><Icon name="trophy" size={14} /> <b>{user.bestScore}</b><small> recorde</small></span></div>
      </section>
      <div className="demo-actions">
        <button className="deposit-button" onClick={openDeposit}>＋ Depositar</button>
        <button className="withdraw-button" onClick={() => setWithdrawOpen(true)}>↗ Sacar</button>
      </div>
      <section className="profile-overview">
        <div className="section-heading"><div><small>SEU DESEMPENHO</small><h3>Visão geral</h3></div></div>
        <div className="overview-grid">
          <article><span><Icon name="gamepad" size={22} /></span><div><strong>{history.length}</strong><small>Partidas</small></div></article>
          <article><span><Icon name="target" size={22} /></span><div><strong>{totalHits}</strong><small>Acertos</small></div></article>
          <article><span><Icon name="trophy" size={22} /></span><div><strong>{user.bestScore}</strong><small>Recorde</small></div></article>
        </div>
      </section>
      <button className="referral-card" onClick={() => { setCopied(false); setReferralOpen(true) }}>
        <span className="referral-icon"><Icon name="gift" size={22} /></span><span><small>PROGRAMA DE INDICAÇÃO</small><strong>Indique e Ganhe</strong><em>Convide amigos e acompanhe suas recompensas.</em></span><b>›</b>
      </button>
      <h3 className="section-title">Partidas recentes</h3>
      <div className="history-list">{history.length ? history.map((game) => <div key={game.id}><span><Icon name="target" size={16} /></span><strong>{game.score} pts</strong><small>{new Date(game.finishedAt).toLocaleDateString('pt-BR')} · {game.hits} acertos</small></div>) : <p>Nenhuma partida registrada ainda.</p>}</div>
      <button className="secondary-button" onClick={() => { api.logout(); onUser(null) }}>Sair da conta</button>
      {depositOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDepositOpen(false) }}>
        <section className="deposit-modal" role="dialog" aria-modal="true" aria-labelledby="deposit-title">
          <header><div><small>DEPÓSITO VIA PIX</small><h2 id="deposit-title">{depositStep === 'amount' ? 'Escolha o valor' : depositStep === 'generating' ? 'Gerando QR Code' : 'Pague com Pix'}</h2></div><button type="button" aria-label="Fechar" onClick={() => setDepositOpen(false)}>×</button></header>
          {depositStep === 'amount' && <>
            <p className="modal-description">Selecione uma opção ou informe outro valor.</p>
            <div className="deposit-values">{[20, 50, 100, 200, 500, 1000].map((value) => <button type="button" key={value} className={!customAmount && depositAmount === value ? 'active' : ''} onClick={() => { setDepositAmount(value); setCustomAmount('') }}>R$ {value}</button>)}</div>
            <label className="money-field"><span>Outro valor</span><div><b>R$</b><input type="number" inputMode="decimal" min="10" step="0.01" value={customAmount} onChange={(event) => setCustomAmount(event.target.value)} placeholder="0,00" /></div><small>Valor mínimo: R$ 10,00</small></label>
            <div className="deposit-summary"><span>Valor do depósito</span><strong>R$ {(Number.isFinite(chosenAmount) ? chosenAmount : 0).toFixed(2).replace('.', ',')}</strong></div>
            {depositError&&<p className="form-error deposit-error" role="alert">{depositError}</p>}
            <button className="primary-button deposit-continue" disabled={!Number.isFinite(chosenAmount) || chosenAmount < 10} onClick={() => void generatePix()}>Continuar</button>
          </>}
          {depositStep === 'generating' && <div className="pix-generating"><div className="spinner"/><h3>Gerando seu QR Code…</h3><p>Aguarde só um instante.</p><div className="generation-steps"><span className="done">✓ Valor confirmado</span><span className="active">• Criando cobrança Pix</span><span>• Preparando pagamento</span></div></div>}
          {depositStep === 'pix' && <div className="pix-ready">
            <div className={`pix-status ${depositConfirmed?'confirmed':''}`}><span>{depositConfirmed?'✓':'⏱'}</span><p><b>{depositConfirmed?'Pagamento confirmado':'Aguardando pagamento'}</b><small>{depositConfirmed?'Saldo atualizado com sucesso.':'O QR Code expira em 15:00'}</small></p></div>
            <div className="qr-frame" aria-label="QR Code Pix">{pixData?.qrImage?<img src={pixData.qrImage} alt="QR Code para pagamento Pix"/>:<div className="qr-placeholder">Use o código<br/>copia e cola</div>}</div>
            <div className="pix-amount"><small>VALOR</small><strong>R$ {chosenAmount.toFixed(2).replace('.', ',')}</strong></div>
            <label className="copy-field"><span>Pix copia e cola</span><div><input readOnly value={pixCode}/><button type="button" onClick={() => void copyPix()}>{copied ? 'Copiado!' : 'Copiar'}</button></div></label>
            <p className="demo-warning">O saldo será atualizado após a confirmação do pagamento pela Zypher.</p>
            <button className="text-button" type="button" onClick={() => setDepositStep('amount')}>Alterar valor</button>
          </div>}
        </section>
      </div>}
      {withdrawOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setWithdrawOpen(false) }}>
        <section className="deposit-modal compact-modal" role="dialog" aria-modal="true" aria-labelledby="withdraw-title">
          <header><div><small>RETIRADA</small><h2 id="withdraw-title">Sacar saldo</h2></div><button type="button" aria-label="Fechar" onClick={() => setWithdrawOpen(false)}>×</button></header>
          <form className="withdraw-form" onSubmit={requestWithdrawal}><div className="withdraw-balance"><small>Saldo disponível</small><strong>R$ {(user.coinBalance / 100).toFixed(2).replace('.', ',')}</strong></div><label>Valor do saque<div className="withdraw-money"><b>R$</b><input type="number" min="10" max={user.coinBalance/100} step="0.01" required value={withdrawAmount} onChange={e=>setWithdrawAmount(e.target.value)}/></div></label><label>CPF ou CNPJ<input inputMode="numeric" required value={withdrawDocument} onChange={e=>setWithdrawDocument(e.target.value)} placeholder="Somente números"/></label><div className="withdraw-key-row"><label>Tipo da chave<select value={withdrawType} onChange={e=>setWithdrawType(e.target.value as typeof withdrawType)}><option value="EMAIL">E-mail</option><option value="CPF">CPF</option><option value="CNPJ">CNPJ</option><option value="PHONE">Telefone</option><option value="EVP">Aleatória</option></select></label><label>Chave Pix<input required value={withdrawKey} onChange={e=>setWithdrawKey(e.target.value)} placeholder="Informe a chave"/></label></div>{withdrawMessage&&<p className="form-error" role="status">{withdrawMessage}</p>}<p className="withdraw-note">O cash-out exige que o IPv4 do servidor esteja autorizado na chave Zypher.</p><button className="primary-button" disabled={withdrawing}>{withdrawing?'Enviando…':'Solicitar saque'}</button></form>
        </section>
      </div>}
      {referralOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setReferralOpen(false) }}>
        <section className="deposit-modal referral-modal" role="dialog" aria-modal="true" aria-labelledby="referral-title">
          <header><div><small>PROGRAMA DE INDICAÇÃO</small><h2 id="referral-title">Indique e Ganhe</h2></div><button type="button" aria-label="Fechar" onClick={() => setReferralOpen(false)}>×</button></header>
          <div className="referral-hero"><span>🎁</span><h3>Jogar é melhor com amigos</h3><p>Compartilhe seu link exclusivo e acompanhe as indicações vinculadas à sua conta.</p></div>
          <div className="referral-how"><h4>Como funciona</h4><ol><li><b>1</b><span><strong>Compartilhe seu link</strong><small>Envie para seus amigos.</small></span></li><li><b>2</b><span><strong>Seu amigo cria uma conta</strong><small>O cadastro fica associado ao seu código.</small></span></li><li><b>3</b><span><strong>Acompanhe as recompensas</strong><small>Benefícios dependem das regras da campanha ativa.</small></span></li></ol></div>
          <div className="referral-code"><span>SEU CÓDIGO</span><strong>{referralCode}</strong></div>
          <label className="copy-field referral-copy"><span>Seu link de indicação</span><div><input readOnly value={referralLink}/><button type="button" onClick={() => void copyReferral()}>{copied ? 'Copiado!' : 'Copiar'}</button></div></label>
          <p className="referral-note">Os valores e critérios da recompensa serão exibidos quando a campanha de indicação estiver configurada no backend.</p>
        </section>
      </div>}
    </main>
  )
  return (
    <main className="page inner-page auth-page">
      <header className="page-header"><button className="icon-button" onClick={onBack}>←</button><h2>{mode === 'login' ? 'Entrar' : 'Criar conta'}</h2><span /></header>
      <section className="auth-card">
        <div className="auth-mascot" aria-hidden="true">🦆</div>
        <div className="auth-heading">
          <h1>{mode === 'login' ? 'Bem-vindo de volta!' : 'Crie sua conta'}</h1>
          <p>{mode === 'login' ? 'Entre para salvar seus pontos e disputar o ranking.' : 'Cadastre-se para jogar, evoluir e guardar seu histórico.'}</p>
        </div>
        <div className="auth-tabs" role="tablist" aria-label="Acesso à conta">
          <button type="button" role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setError('') }}>Entrar</button>
          <button type="button" role="tab" aria-selected={mode === 'register'} className={mode === 'register' ? 'active' : ''} onClick={() => { setMode('register'); setError('') }}>Cadastro</button>
        </div>
        <form className="auth-form" onSubmit={submit}>
          {mode === 'register' && <label>Nome<input name="name" minLength={2} required autoComplete="name" placeholder="Como quer ser chamado?" /></label>}
          <label>E-mail<input name="email" type="email" required autoComplete="email" inputMode="email" placeholder="voce@exemplo.com" /></label>
          <label>Senha<input name="password" type="password" minLength={8} required autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder="Mínimo 8 caracteres" /></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button type="submit" className="primary-button" disabled={loading}>{loading ? 'Aguarde…' : mode === 'login' ? 'Entrar e jogar' : 'Criar minha conta'}</button>
        </form>
      </section>
    </main>
  )
}
