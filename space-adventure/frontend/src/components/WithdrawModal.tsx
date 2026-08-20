import { Icon } from './Icon'

// Placeholder shell — mirrors the site's modal chrome (backdrop + card + hero banner) so the
// "Sacar" button has somewhere real to land. The actual withdrawal flow (amount, PIX key, etc.)
// still needs to be built inside this card.
export function WithdrawModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section className="modal-card withdraw-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-close" aria-label="Fechar" onClick={onClose}><Icon name="close" size={16} /></button>
        <div className="withdraw-banner" />
        <h1>Sacar</h1>
        <p className="withdraw-modal__soon">Resgate via PIX chegando em breve por aqui.</p>
      </section>
    </div>
  )
}
