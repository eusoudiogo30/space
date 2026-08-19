import { useEffect, useState } from 'react'
import { Icon } from './Icon'
import { api } from '../services/api'
import type { MyAffiliate, User } from '../types'

export function ReferralModal({ onClose, onUser }: { onClose: () => void; onUser: (user: User) => void }) {
  const [affiliate, setAffiliate] = useState<MyAffiliate | null>(null)
  const [copied, setCopied] = useState(false)
  const [message, setMessage] = useState('')
  const [redeeming, setRedeeming] = useState(false)

  const reload = () => api.myAffiliate().then((d) => setAffiliate(d.affiliate)).catch((e) => setMessage(e instanceof Error ? e.message : 'Erro ao carregar.'))
  useEffect(() => { reload() }, [])

  const link = affiliate ? `${window.location.origin}/?ref=${affiliate.code}` : ''

  const copy = async () => {
    if (!link) return
    try { await navigator.clipboard.writeText(link); setCopied(true); window.setTimeout(() => setCopied(false), 2000) } catch { /* clipboard unavailable */ }
  }

  const share = async () => {
    if (!link) return
    if (navigator.share) {
      try { await navigator.share({ title: 'Space Adventure', text: 'Jogue comigo no Space Adventure!', url: link }) } catch { /* user cancelled */ }
    } else {
      void copy()
    }
  }

  const redeem = async () => {
    if (!affiliate || affiliate.availableBalance <= 0) return
    setRedeeming(true); setMessage('')
    try {
      await api.redeemAffiliateCommission()
      const { user } = await api.me()
      onUser(user)
      setMessage('Comissão resgatada e creditada no seu saldo!')
      await reload()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Não foi possível resgatar.')
    } finally {
      setRedeeming(false)
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section className="modal-card referral-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-close" aria-label="Fechar" onClick={onClose}><Icon name="close" size={16} /></button>
        <div className="referral-banner">
          <span>🚀 INDIQUE PILOTOS</span>
          <b>E GANHE COMISSÃO</b>
        </div>
        <h1>Indique e Ganhe</h1>
        <p className="referral-lead">Convide seus amigos para jogarem no Space Adventure! Quanto mais amigos, mais recompensas.</p>

        {!affiliate ? <p className="empty">Carregando…</p> : (
          <>
            <div className="referral-grid">
              <div className="referral-stat">
                <small>Indicações</small>
                <b>{affiliate.referralsCount}</b>
                <span>amigos convidados</span>
              </div>
              <div className="referral-stat">
                <small>1º Depósitos</small>
                <b className="positive-value">{affiliate.firstDepositsCount}</b>
                <span>indicados que depositaram</span>
              </div>
              <div className="referral-stat">
                <small>Total Depósitos</small>
                <b className="positive-value">R$ {(affiliate.totalReferredDeposits / 100).toFixed(2).replace('.', ',')}</b>
                <span>dos seus indicados</span>
              </div>
              <div className="referral-stat">
                <small>Comissões</small>
                <b className="positive-value">R$ {(affiliate.availableBalance / 100).toFixed(2).replace('.', ',')}</b>
                <span>disponível para resgate</span>
                <button type="button" className="ghost-button tiny referral-redeem" disabled={affiliate.availableBalance <= 0 || redeeming} onClick={() => void redeem()}>
                  {redeeming ? 'Resgatando…' : 'Resgatar'}
                </button>
              </div>
            </div>

            <div className="referral-link">
              <div className="referral-link__head"><Icon name="share" size={15} /><b>Seu Link de Indicação</b></div>
              <p>Compartilhe com seus amigos para ganharem juntos</p>
              <div className="referral-link__input">
                <input value={link} readOnly />
                <button type="button" onClick={() => void copy()} aria-label="Copiar link"><Icon name="copy" size={15} /></button>
              </div>
              <div className="referral-link__actions">
                <button type="button" className="secondary-button inline" onClick={() => void copy()}><Icon name="copy" size={14} />{copied ? 'Copiado!' : 'Copiar'}</button>
                <button type="button" className="primary-button referral-share" onClick={() => void share()}><Icon name="share" size={14} />Compartilhar</button>
              </div>
              <span className="referral-code">Seu código: <b>{affiliate.code}</b></span>
            </div>
          </>
        )}
        {message && <p className="save-message">{message}</p>}
      </section>
    </div>
  )
}
