import { useEffect, useState, type FormEvent } from 'react'
import { api } from '../services/api'
import type { User } from '../types'
import { Icon } from './Icon'

type PixType = 'CPF' | 'CNPJ' | 'EMAIL' | 'PHONE' | 'EVP'
type Eligibility = {
  balance: number
  minimumAmount: number
  maximumAmount: number
  feePercentage: number
  rollover: { multiplier: number; required: number; wagered: number; remaining: number; met: boolean }
}
type CompletedWithdrawal = { id: string; amount: number; feeAmount: number; netAmount: number; status: string }

const money = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export function WithdrawModal({ user, onClose, onUser }: { user: User; onClose: () => void; onUser: (user: User) => void }) {
  const [eligibility, setEligibility] = useState<Eligibility | null>(null)
  const [amount, setAmount] = useState('50')
  const [document, setDocument] = useState(user.document || '')
  const [pixType, setPixType] = useState<PixType>('CPF')
  const [pixKey, setPixKey] = useState(user.document || '')
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)
  const [error, setError] = useState('')
  const [completed, setCompleted] = useState<CompletedWithdrawal | null>(null)

  useEffect(() => {
    api.withdrawalEligibility()
      .then(setEligibility)
      .catch((err) => setError(err instanceof Error ? err.message : 'Não foi possível consultar seu saque.'))
      .finally(() => setChecking(false))
  }, [])

  const amountCents = Math.round((Number(amount.replace(',', '.')) || 0) * 100)
  const progress = eligibility?.rollover.required
    ? Math.min(100, Math.round((eligibility.rollover.wagered / eligibility.rollover.required) * 100))
    : 100

  const changePixType = (next: PixType) => {
    setPixType(next)
    if (next === 'CPF' && user.document) setPixKey(user.document)
    else if (next === 'PHONE' && user.phone) setPixKey(user.phone)
    else setPixKey('')
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!eligibility) return
    if (!eligibility.rollover.met) { setError(`Ainda falta apostar ${money(eligibility.rollover.remaining)} para completar o rollover.`); return }
    if (amountCents < eligibility.minimumAmount) { setError(`O saque mínimo é ${money(eligibility.minimumAmount)}.`); return }
    if (amountCents > eligibility.balance) { setError('Saldo insuficiente para este saque.'); return }
    setError('')
    setLoading(true)
    try {
      const result = await api.createWithdrawal({ amount: amountCents / 100, document, pixKey, pixType })
      setCompleted(result.withdrawal)
      setEligibility((old) => old ? { ...old, balance: result.wallet.availableBalance } : old)
      onUser({ ...user, coins: result.wallet.availableBalance })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível concluir o saque.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section className="modal-card withdraw-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-close" aria-label="Fechar" onClick={onClose}><Icon name="close" size={16} /></button>
        <div className="withdraw-banner" />
        {completed ? (
          <div className="withdraw-complete">
            <span className="withdraw-complete__icon"><Icon name="check" size={28} /></span>
            <small>SAQUE CONCLUÍDO</small>
            <h1>{money(completed.netAmount)}</h1>
            <p>Solicitação processada com sucesso para a chave PIX terminada em <strong>{pixKey.slice(-4)}</strong>.</p>
            {completed.feeAmount > 0 && <div className="withdraw-receipt"><span>Valor solicitado</span><strong>{money(completed.amount)}</strong><span>Taxa</span><strong>- {money(completed.feeAmount)}</strong></div>}
            <button type="button" className="primary-button withdraw-submit" onClick={onClose}>Concluir</button>
          </div>
        ) : (
          <>
            <div className="withdraw-heading"><div><h1>Sacar via PIX</h1><p>Processamento interno e conclusão imediata.</p></div><span><small>Saldo disponível</small><strong>{eligibility ? money(eligibility.balance) : '—'}</strong></span></div>

            {checking ? <div className="withdraw-loading">Verificando saldo e rollover…</div> : eligibility && (
              <form className="withdraw-form" onSubmit={submit}>
                <div className={`rollover-card ${eligibility.rollover.met ? 'rollover-card--complete' : ''}`}>
                  <div className="rollover-card__head"><span><Icon name={eligibility.rollover.met ? 'check' : 'timer'} size={15} /> Rollover 1x</span><strong>{eligibility.rollover.met ? 'Concluído' : `${progress}%`}</strong></div>
                  <div className="rollover-progress"><i style={{ width: `${progress}%` }} /></div>
                  <small>{eligibility.rollover.met
                    ? `${money(eligibility.rollover.wagered)} apostados · saque liberado`
                    : `${money(eligibility.rollover.wagered)} de ${money(eligibility.rollover.required)} · faltam ${money(eligibility.rollover.remaining)}`}</small>
                </div>

                <label className="withdraw-amount"><span>VALOR DO SAQUE</span><div><b>R$</b><input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9,.]/g, ''))} /></div><small>Mínimo {money(eligibility.minimumAmount)} · máximo disponível {money(Math.min(eligibility.balance, eligibility.maximumAmount))}</small></label>

                <div className="withdraw-fields">
                  <label>CPF/CNPJ do titular<input inputMode="numeric" value={document} onChange={(e) => setDocument(e.target.value.replace(/\D/g, '').slice(0, 14))} placeholder="Somente números" required /></label>
                  <label>Tipo de chave<select value={pixType} onChange={(e) => changePixType(e.target.value as PixType)}><option value="CPF">CPF</option><option value="CNPJ">CNPJ</option><option value="PHONE">Celular</option><option value="EMAIL">E-mail</option><option value="EVP">Chave aleatória</option></select></label>
                  <label className="wide">Chave PIX<input value={pixKey} onChange={(e) => setPixKey(e.target.value)} placeholder="Informe a chave PIX" required minLength={3} maxLength={200} /></label>
                </div>

                <div className="withdraw-security"><Icon name="lock" size={16} /><span><strong>Validação segura</strong><small>O valor só é debitado se o saldo e o rollover forem validados pelo servidor.</small></span></div>
                {error && <p className="form-error" role="alert">{error}</p>}
                <button className="primary-button withdraw-submit" disabled={loading || !eligibility.rollover.met || amountCents < eligibility.minimumAmount || amountCents > eligibility.balance}>
                  {loading ? 'Processando…' : `Sacar ${amountCents > 0 ? money(amountCents) : ''}`}
                </button>
              </form>
            )}
            {!checking && error && !eligibility && <p className="form-error withdraw-error" role="alert">{error}</p>}
          </>
        )}
      </section>
    </div>
  )
}
