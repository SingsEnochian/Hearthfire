import { createHash, randomUUID } from 'node:crypto';

export const WALLET_MODE = Object.freeze({ OFF: 'OFF', SHADOW: 'SHADOW', MANUAL: 'MANUAL', AUTO: 'AUTO' });

export class WalletPolicyError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'WalletPolicyError';
    this.code = code;
    this.details = details;
  }
}

const money = value => Math.round(Number(value) * 1_000_000) / 1_000_000;
const hostOf = url => new URL(url).hostname.toLowerCase();
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function createWalletCapability({ adapter, receiptStore, clock = () => new Date(), mode = WALLET_MODE.OFF }) {
  if (!adapter?.quote || !adapter?.pay) throw new TypeError('wallet adapter must implement quote() and pay()');
  if (!receiptStore?.append) throw new TypeError('receiptStore must implement append()');

  return {
    async requestPurchase(request, policy) {
      const intent = normalizeIntent(request, clock);
      const decision = evaluate(intent, policy, mode);

      if (!decision.allowed) {
        const receipt = makeReceipt(intent, decision, null, clock);
        await receiptStore.append(receipt);
        throw new WalletPolicyError(decision.code, decision.reason, { receipt });
      }

      const quote = await adapter.quote(intent);
      const quoted = { ...intent, amount: money(quote.amount), currency: quote.currency, quoteId: quote.quoteId };
      const quoteDecision = evaluate(quoted, policy, mode);

      if (!quoteDecision.allowed) {
        const receipt = makeReceipt(quoted, quoteDecision, quote, clock);
        await receiptStore.append(receipt);
        throw new WalletPolicyError(quoteDecision.code, quoteDecision.reason, { receipt });
      }

      // Only an adapter-explicit free response bypasses approval/payment.
      // Absence of a challenge is not enough: test adapters and non-x402 providers
      // may represent paid quotes without exposing the raw challenge object.
      if (quote.isFree === true) {
        const receipt = makeReceipt(quoted, { ...quoteDecision, code: 'FREE_ACCESS', reason: 'Resource is free; no payer call was made.' }, quote, clock);
        await receiptStore.append(receipt);
        return { status: 'FREE_ACCESS', receipt, response: quote.response };
      }

      if (quoteDecision.requiresApproval) {
        const receipt = makeReceipt(quoted, quoteDecision, quote, clock);
        await receiptStore.append(receipt);
        return { status: 'APPROVAL_REQUIRED', receipt };
      }

      if (mode === WALLET_MODE.SHADOW) {
        const receipt = makeReceipt(quoted, { ...quoteDecision, code: 'SHADOW_APPROVED', reason: 'Policy approved; payment not executed in shadow mode.' }, quote, clock);
        await receiptStore.append(receipt);
        return { status: 'SHADOW_APPROVED', receipt };
      }

      const payment = await adapter.pay({ ...quoted, quote });
      const receipt = makeReceipt(quoted, { ...quoteDecision, code: 'PAID', reason: 'Payment executed.' }, { ...quote, payment }, clock);
      await receiptStore.append(receipt);
      return { status: 'PAID', payment, receipt };
    }
  };
}

export function evaluate(intent, policy = {}, mode = WALLET_MODE.OFF) {
  if (mode === WALLET_MODE.OFF) return deny('WALLET_OFF', 'Wallet capability is disabled.');
  if (!intent.agentId) return deny('MISSING_AGENT', 'A stable agent identity is required.');
  if (!intent.purpose) return deny('MISSING_PURPOSE', 'A human-readable purchase purpose is required.');
  if (!Number.isFinite(intent.amount) || intent.amount < 0) return deny('INVALID_AMOUNT', 'Amount must be a non-negative number.');

  const host = hostOf(intent.resourceUrl);
  if (policy.allowedHosts?.length && !policy.allowedHosts.some(x => host === x || host.endsWith(`.${x}`))) {
    return deny('HOST_DENIED', `Merchant host ${host} is not allow-listed.`);
  }
  if (policy.deniedHosts?.some(x => host === x || host.endsWith(`.${x}`))) {
    return deny('HOST_DENIED', `Merchant host ${host} is denied.`);
  }
  if (policy.allowedCurrencies?.length && !policy.allowedCurrencies.includes(intent.currency)) {
    return deny('CURRENCY_DENIED', `Currency ${intent.currency} is not allowed.`);
  }
  if (policy.perTransactionLimit != null && intent.amount > policy.perTransactionLimit) {
    return deny('LIMIT_EXCEEDED', 'Purchase exceeds the per-transaction limit.');
  }
  if (policy.requireApprovalAbove != null && intent.amount > policy.requireApprovalAbove) {
    return allow(true, 'APPROVAL_REQUIRED', 'Human approval is required above the configured threshold.');
  }
  if (mode === WALLET_MODE.MANUAL) return allow(true, 'APPROVAL_REQUIRED', 'Manual mode requires human approval.');
  return allow(Boolean(policy.alwaysRequireApproval), policy.alwaysRequireApproval ? 'APPROVAL_REQUIRED' : 'POLICY_APPROVED', 'Policy checks passed.');
}

function normalizeIntent(request, clock) {
  return {
    intentId: request.intentId || randomUUID(),
    agentId: String(request.agentId || ''),
    capability: request.capability || 'wallet.pay',
    resourceUrl: String(request.resourceUrl || ''),
    purpose: String(request.purpose || ''),
    amount: money(request.amount ?? 0),
    currency: String(request.currency || 'USDC').toUpperCase(),
    metadata: request.metadata || {},
    requestedAt: clock().toISOString()
  };
}

function makeReceipt(intent, decision, provider, clock) {
  const body = {
    receiptId: randomUUID(),
    intentId: intent.intentId,
    agentId: intent.agentId,
    capability: intent.capability,
    resourceUrl: intent.resourceUrl,
    purpose: intent.purpose,
    amount: intent.amount,
    currency: intent.currency,
    decision: decision.code,
    reason: decision.reason,
    provider: provider || null,
    createdAt: clock().toISOString()
  };
  return { ...body, receiptHash: hash(body) };
}

const deny = (code, reason) => ({ allowed: false, requiresApproval: false, code, reason });
const allow = (requiresApproval, code, reason) => ({ allowed: true, requiresApproval, code, reason });
