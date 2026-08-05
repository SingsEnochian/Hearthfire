// Provider seam for Cloudflare Agents SDK / Wallets.
// No private key or wallet secret is exposed to model prompts or tool arguments.
export function createX402Adapter({ fetchImpl = fetch, payer }) {
  if (!payer?.pay) throw new TypeError('payer.pay() is required');

  return {
    async quote(intent) {
      const response = await fetchImpl(intent.resourceUrl, {
        method: intent.metadata?.method || 'GET',
        headers: { Accept: intent.metadata?.accept || 'application/json' }
      });

      if (response.status !== 402) {
        if (response.ok) return { amount: 0, currency: intent.currency, quoteId: `free:${intent.intentId}`, response };
        throw new Error(`Merchant quote failed with HTTP ${response.status}`);
      }

      const challenge = await parseChallenge(response);
      return {
        amount: Number(challenge.amount),
        currency: String(challenge.currency || intent.currency).toUpperCase(),
        quoteId: challenge.id || challenge.quoteId || intent.intentId,
        challenge
      };
    },

    async pay({ quote, ...intent }) {
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
