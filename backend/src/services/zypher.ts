type ZypherOptions = {
  baseUrl: string; clientId: string; clientSecret: string; webhookUrl: string; webhookToken: string
  timeoutMs: number; splitUsername?: string; splitPercentage?: number
}

export class ZypherProvider {
  constructor(private readonly options: ZypherOptions) {}

  private callbackUrl() {
    const url = new URL(this.options.webhookUrl)
    url.searchParams.set('webhook_token', this.options.webhookToken)
    return url.toString()
  }

  private async request(path: string, init: RequestInit = {}) {
    const response = await fetch(`${this.options.baseUrl.replace(/\/$/, '')}${path}`, {
      ...init,
      signal: AbortSignal.timeout(this.options.timeoutMs),
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Id': this.options.clientId,
        'X-Client-Secret': this.options.clientSecret,
        ...init.headers,
      },
    })
    const body = await response.json().catch(() => ({})) as Record<string, unknown>
    if (!response.ok || body.ok === false) throw new Error(String(body.message || body.error || `Gateway HTTP ${response.status}`))
    return body
  }

  async testConnection() {
    const reference = `duck-credential-check-${Date.now()}`
    const response = await fetch(`${this.options.baseUrl.replace(/\/$/, '')}/consult-transaction?request_number=${reference}`, {
      signal: AbortSignal.timeout(this.options.timeoutMs),
      headers: { 'X-Client-Id': this.options.clientId, 'X-Client-Secret': this.options.clientSecret },
    })
    if ([401, 403].includes(response.status)) throw new Error('Credenciais recusadas pelo gateway.')
    if (!response.ok && ![400, 404, 422].includes(response.status)) throw new Error(`Gateway respondeu HTTP ${response.status}.`)
    return true
  }

  async createDeposit(input: { reference: string; amount: number; name: string; document?: string }) {
    const splitPercentage = Number(this.options.splitPercentage)
    const splitEnabled = Boolean(this.options.splitUsername) && splitPercentage > 0 && splitPercentage <= 90
    const body = await this.request('/cashin', {
      method: 'POST',
      headers: { 'Idempotency-Key': input.reference },
      body: JSON.stringify({
        request_number: input.reference, currency: 'BRL', amount: input.amount / 100,
        name: input.name, ...(input.document ? { document: input.document } : {}),
        description: 'Depósito Duck Game', webhook_url: this.callbackUrl(),
        // Zypher applies cash-in splits over the net amount. Cash-out does not accept this field.
        ...(splitEnabled ? { splits: [{ username: this.options.splitUsername, percentage: splitPercentage }] } : {}),
      }),
    })
    return { transactionId: String(body.transaction_id || ''), qrImage: String(body.qr_img || ''), copyPaste: String(body.copyPaste || body.code || '') }
  }

  async requestWithdrawal(input: { reference: string; amount: number; name: string; document: string; pixKey: string; pixType: string }) {
    const body = await this.request('/cashout', {
      method: 'POST',
      headers: { 'Idempotency-Key': input.reference },
      body: JSON.stringify({
        request_number: input.reference, currency: 'BRL', amount: input.amount / 100,
        name: input.name, document: input.document, pix_key: input.pixKey,
        pix_type: input.pixType, webhook_url: this.callbackUrl(),
      }),
    })
    return { transactionId: String(body.transaction_id || ''), endToEndId: String(body.e2e || ''), status: String(body.status || 'PENDING') }
  }

  getTransaction(reference: string) {
    return this.request(`/consult-transaction?request_number=${encodeURIComponent(reference)}`)
  }
}
