import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'
import { api } from '../services/api'
import type { User } from '../types'

const PRESET_AMOUNTS = [20, 30, 50, 100, 200, 500]
const POPULAR_AMOUNT = 30
const RECOMMENDED_AMOUNT = 100
const POLL_MS = 3000

type Deposit = { id: string; amount: number; status: string; qrImage: string | null; copyPaste: string | null }

export function DepositModal({ onClose, onUser }: { onClose: () => void; onUser: (user: User) => void }) {
  const [amount, setAmount] = useState(PRESET_AMOUNTS[0])
  const [customAmount, setCustomAmount] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [deposit, setDeposit] = useState<Deposit | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [copied, setCopied] = useState(false)
  const [limits, setLimits] = useState<{ min: string; max: string } | null>(null)
  const [recentDepositors, setRecentDepositors] = useState<number | null>(null)
  const pollRef = useRef<number | null>(null)

  const effectiveAmount = customAmount ? Number(customAmount) : amount

  useEffect(() => () => { if (pollRef.current) window.clearInterval(pollRef.current) }, [])

  useEffect(() => {
    api.getConfig().then((cfg) => setLimits({ min: cfg.minimumDeposit, max: cfg.maximumDeposit })).catch(() => {})
    api.recentDepositActivity().then((d) => setRecentDepositors(d.recentDepositors)).catch(() => {})
  }, [])

  const generate = async () => {
    if (!effectiveAmount || effectiveAmount <= 0) { setError('Informe um valor válido.'); return }
    setError(''); setLoading(true)
    try {
      const { deposit: created } = await api.createDeposit(effectiveAmount)
      setDeposit(created)
      pollRef.current = window.setInterval(async () => {
        try {
          const { deposit: updated } = await api.getDeposit(created.id)
          if (updated.status === 'CONFIRMED') {
            if (pollRef.current) window.clearInterval(pollRef.current)
            setConfirmed(true)
            const { user } = await api.me()
            onUser(user)
          }
        } catch { /* keep polling — a transient network error shouldn't cancel it */ }
      }, POLL_MS)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível gerar o depósito.')
    } finally {
      setLoading(false)
    }
  }

  const copyCode = async () => {
    if (!deposit?.copyPaste) return
    try {
      await navigator.clipboard.writeText(deposit.copyPaste)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard permission unavailable */ }
  }

  return (
    <div className="modal-backdrop modal-backdrop--bottom" role="presentation" onClick={onClose}>
      <section className="deposit-card deposit-card--sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-close" aria-label="Fechar" onClick={onClose}><Icon name="close" size={16} /></button>
        <div className="deposit-banner" />
        <h1>Depositar</h1>
        <p className="deposit-subtitle">Via PIX — crédito instantâneo</p>

        {confirmed ? (
          <div className="deposit-confirmed">
            <span className="deposit-confirmed__icon">✓</span>
            <h2>Depósito confirmado!</h2>
            <p>Seu saldo já foi atualizado. Bom voo!</p>
            <button type="button" className="primary-button deposit-cta" onClick={onClose}>Fechar</button>
          </div>
        ) : deposit ? (
          <div className="deposit-qr">
            {deposit.qrImage
              ? <img src={deposit.qrImage} alt="QR Code PIX" />
              : <p className="form-error" role="alert">Não foi possível gerar o QR Code. Tente novamente.</p>}
            <p className="deposit-waiting"><span className="deposit-waiting__dot" /> Aguardando pagamento…</p>
            {deposit.copyPaste && (
              <button type="button" className="secondary-button" onClick={() => void copyCode()}>{copied ? 'Código copiado!' : 'Copiar código PIX'}</button>
            )}
          </div>
        ) : (
          <>
            <div className="deposit-secure"><span>🔒</span> Pagamento seguro e instantâneo<br /><small>Seu depósito é creditado na hora via PIX</small></div>
            <div className="deposit-grid">
              {PRESET_AMOUNTS.map((value) => (
                <button
                  key={value}
                  type="button"
                  className={`deposit-option ${value === POPULAR_AMOUNT ? 'deposit-option--popular' : ''} ${value === RECOMMENDED_AMOUNT ? 'deposit-option--recommended' : ''} ${!customAmount && amount === value ? 'selected' : ''}`}
                  onClick={() => { setAmount(value); setCustomAmount('') }}
                >
                  {value === POPULAR_AMOUNT && <em>Popular</em>}
                  {value === RECOMMENDED_AMOUNT && <em className="deposit-option__badge--recommended">Recomendado</em>}
                  R$ {value.toFixed(2).replace('.', ',')}
                </button>
              ))}
            </div>
            <label className="deposit-custom">
              <span>VALOR PERSONALIZADO</span>
              <span className="deposit-custom__input"><b>R$</b><input inputMode="numeric" placeholder="0" value={customAmount} onChange={(e) => setCustomAmount(e.target.value.replace(/\D/g, ''))} /></span>
            </label>
            {limits && (
              <div className="deposit-limits"><span>Mín. R$ {Number(limits.min).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span><span>Máx. R$ {Number(limits.max).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span></div>
            )}
            {recentDepositors !== null && recentDepositors > 0 && (
              <p className="deposit-social"><i /> {recentDepositors} {recentDepositors === 1 ? 'pessoa depositou' : 'pessoas depositaram'} nos últimos 30 min</p>
            )}
            {error && <p className="form-error" role="alert">{error}</p>}
            <button type="button" className="primary-button deposit-cta" disabled={loading} onClick={() => void generate()}>
              {loading ? 'Gerando…' : 'Gerar QR Code PIX'}
            </button>
          </>
        )}
      </section>
    </div>
  )
}
