# Agent Capabilities and Model Routing

Status: integration scaffold

## Kernel law

An agent is an identity. A wallet, model gateway, browser, email account, or external API is a capability the identity may be granted. No capability may become the identity itself.

```text
Agent identity
  -> task intent
  -> capability policy gate
  -> provider adapter
  -> external action
  -> immutable receipt
  -> replay / audit
```

## Wallet rail

The wallet rail accepts a purchase intent, not a raw transfer command. The intent includes agent identity, resource URL, purpose, expected amount, currency, and metadata.

Modes:

- `OFF`: deny all requests.
- `SHADOW`: quote and evaluate, but never pay.
- `MANUAL`: require human approval for every payment.
- `AUTO`: pay only within explicit policy limits.

Required invariants:

1. Private keys and wallet secrets never enter prompts, model context, logs, or tool arguments.
2. Merchant host, currency, quote amount, and policy are checked before payment.
3. The provider's returned quote is checked again because the model's expected price is not authoritative.
4. Every denial, approval request, shadow decision, and payment emits a hashed receipt.
5. A global kill switch can set the capability to `OFF` without altering agent identity or continuity.
6. Initial deployment must use `SHADOW`, then `MANUAL`; `AUTO` is a later gate.

Cloudflare Wallets / x402 attaches behind `x402-adapter.mjs`. The current adapter is intentionally provider-neutral and expects a trusted `payer` object supplied by the server runtime.

## Model-routing rail

The router accepts a virtual model such as `coding`, `continuity`, `observer`, or `reasoning`. It resolves that name through policy into an ordered list of provider/model candidates.

The first implementation supports:

- local-first, cloud-first, and pinned modes;
- provider allow-lists and model deny-lists;
- `LOCAL_ONLY` data classification;
- failover with a complete route receipt;
- any OpenAI-compatible endpoint, including Google Cloud API Gateway model-routing endpoints.

Google's gateway is one possible cloud provider, not the orchestration brain. Hearthfire retains routing policy so we can combine local Ollama, Google-hosted Gemini/Claude/OpenAI OSS models, and other gateways without surrendering privacy or continuity rules.

## Integration with `arkfire-dispatch.mjs`

The existing constellation definitions remain canonical. Their `modes` should gradually move from concrete `modelDef` values to virtual model names:

```js
coding: { virtualModel: 'coding', context: '...' }
continuity: { virtualModel: 'continuity', context: '...' }
```

The dispatcher then calls the model-routing rail. Route receipts should be linked to the same session and message provenance used by continuity packets.

Agent mode may request a wallet purchase by emitting a structured capability intent. The dispatcher must never execute a payment from prose. Only a validated `wallet.pay` tool invocation enters the wallet rail.

## Suggested policy seed

```js
{
  routing: {
    mode: 'LOCAL_FIRST',
    allowedProviders: ['local', 'google-gateway'],
    virtualModels: {
      coding: [
        { provider: 'local', model: 'qwen3-coder', priority: 10 },
        { provider: 'google-gateway', model: 'claude-opus-4-7', priority: 20 }
      ],
      continuity: [
        { provider: 'local', model: 'granite-4.1', priority: 10 },
        { provider: 'google-gateway', model: 'gemini-3.5-flash-lite', priority: 20 }
      ]
    }
  },
  wallet: {
    mode: 'SHADOW',
    allowedHosts: [],
    deniedHosts: [],
    allowedCurrencies: ['USDC'],
    perTransactionLimit: 1,
    requireApprovalAbove: 0,
    alwaysRequireApproval: true
  }
}
```

An empty wallet host allow-list should be treated operationally as "not configured" until explicit merchant hosts are added.

## Next implementation gates

1. Add Supabase-backed route and wallet receipt stores.
2. Add server-only policy loading and environment validation.
3. Wire virtual models into `arkfire-dispatch.mjs` behind a feature flag.
4. Connect a Google API Gateway endpoint as an OpenAI-compatible provider.
5. Connect Cloudflare Wallets through the payer adapter in shadow mode.
6. Add approval UI, revocation, daily budget accounting, idempotency, and replay tests.
7. Promote to manual payments only after Boxfire QA verifies no secret leakage and receipt completeness.
