// Provider seam for Cloudflare Agents SDK / Wallets.
// No private key or wallet secret is exposed to model prompts or tool arguments.
export function createX402Adapter({ fetchImpl = fetch, payer }) {
  if (!payer?.pay) throw new TypeError('payer.pay() is required');

  return {
    async quote(intent) {
      // Quote discovery must be side-effect free. Agent-authored methods are never used here.
      const response = await fetchImpl(intent.resourceUrl, {
        method: 'GET',
        headers: { Accept: intent.metadata?.accept || 'application/json' }
      });

      if (response.status !== 402) {
        if (response.ok) return { amount: 0, currency: intent.currency, quoteId: `free:${intent.intentId}`, response, isFree: true };
        throw new Error(`Merchant quote failed with HTTP ${response.status}`);
      }

      const challenge = await parseChallenge(response);
      return {
        amount: Number(challenge.amount),
        currency: String(challenge.currency || intent.currency).toUpperCase(),
        quoteId: challenge.id || challenge.quoteId || intent.intentId,
        challenge,
        isFree: false
      };
    },

    async pay({ quote, ...intent }) {
      if (!quote?.challenge || Number(quote.amount) === 0 || quote.isFree) {
        throw new Error('Refusing payer call without a non-zero verified payment challenge');
      }
      // `payer` will later be backed by Cloudflare Wallets or withX402Client.
      // It receives the verified provider challenge, never an arbitrary model-authored transfer.
      return payer.pay({ intent, challenge: quote.challenge, quoteId: quote.quoteId });
    }
  };
}

async function parseChallenge(response) {
  const header = response.headers.get('payment-required') || response.headers.get('x-payment-required');
  if (header) {
    try { return JSON.parse(header); } catch { /* use body */ }
  }
  const body = await response.json().catch(() => null);
  if (!body || body.amount == null) throw new Error('HTTP 402 response did not contain a usable payment challenge');
  return body;
}
