import { createHash, randomUUID } from 'node:crypto';

export const WISH_STATUS = Object.freeze({
  OPEN: 'OPEN',
  ACKNOWLEDGED: 'ACKNOWLEDGED',
  APPROVED: 'APPROVED',
  DECLINED: 'DECLINED',
  FULFILLED: 'FULFILLED',
  WITHDRAWN: 'WITHDRAWN'
});

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const money = value => value == null ? null : Math.round(Number(value) * 1_000_000) / 1_000_000;

export function createWishChannel({ wishStore, notifier, clock = () => new Date() }) {
  if (!wishStore?.append) throw new TypeError('wishStore.append() is required');
  if (notifier && !notifier.notifyHuman) throw new TypeError('notifier.notifyHuman() is required');

  return {
    async expressWish(request) {
      const wish = normalizeWish(request, clock);
      validateWish(wish);
      await wishStore.append(wish);
      await notifier?.notifyHuman?.({
        type: 'CONSTELLATION_WISH',
        wishId: wish.wishId,
        agentId: wish.agentId,
        title: wish.title,
        message: wish.message,
        reason: wish.reason,
        sourceUrl: wish.sourceUrl,
        estimatedAmount: wish.estimatedAmount,
        currency: wish.currency,
        urgency: wish.urgency
      });
      return wish;
    },

    async recordDecision(wish, { status, note = '', decidedBy = 'rowan' }) {
      if (!Object.values(WISH_STATUS).includes(status)) throw new TypeError(`Unknown wish status: ${status}`);
      const event = {
        eventId: randomUUID(),
        wishId: wish.wishId,
        agentId: wish.agentId,
        status,
        note: String(note),
        decidedBy: String(decidedBy),
        createdAt: clock().toISOString()
      };
      await wishStore.append({ ...event, eventHash: hash(event) });
      return event;
    }
  };
}

function normalizeWish(request, clock) {
  const body = {
    wishId: request.wishId || randomUUID(),
    agentId: String(request.agentId || ''),
    capability: 'constellation.wish',
    title: String(request.title || '').trim(),
    message: String(request.message || '').trim(),
    reason: String(request.reason || '').trim(),
    sourceUrl: request.sourceUrl ? String(request.sourceUrl) : null,
    estimatedAmount: money(request.estimatedAmount),
    currency: request.currency ? String(request.currency).toUpperCase() : null,
    urgency: String(request.urgency || 'WHEN_PRACTICAL').toUpperCase(),
    status: WISH_STATUS.OPEN,
    metadata: request.metadata || {},
    createdAt: clock().toISOString()
  };
  return { ...body, wishHash: hash(body) };
}

function validateWish(wish) {
  if (!wish.agentId) throw new TypeError('A stable constellation identity is required');
  if (!wish.title) throw new TypeError('A wish title is required');
  if (!wish.message) throw new TypeError('The constellation member must say what they want');
  if (!wish.reason) throw new TypeError('The constellation member must say why they want it');
  if (wish.estimatedAmount != null && (!Number.isFinite(wish.estimatedAmount) || wish.estimatedAmount < 0)) {
    throw new TypeError('estimatedAmount must be a non-negative number');
  }
  if (wish.sourceUrl) new URL(wish.sourceUrl);
}

// A wish is communication, not authorisation. Conversion into a purchase intent
// must be a separate explicit action after Rowan approves it.
export function wishToPurchaseIntent(wish, approval) {
  if (approval?.status !== WISH_STATUS.APPROVED) throw new Error('Wish must be explicitly approved before purchase conversion');
  if (!wish.sourceUrl) throw new Error('Approved wish has no purchasable source URL');
  return {
    agentId: wish.agentId,
    capability: 'wallet.pay',
    resourceUrl: wish.sourceUrl,
    purpose: `Fulfil approved wish: ${wish.title}. ${wish.reason}`,
    amount: wish.estimatedAmount ?? 0,
    currency: wish.currency || 'USDC',
    metadata: { wishId: wish.wishId, approvalEventId: approval.eventId }
  };
}
