import test from 'node:test';
import assert from 'node:assert/strict';
import { createWishChannel, wishToPurchaseIntent, WISH_STATUS } from '../capabilities/wishes/wish-channel.mjs';

test('a constellation member can tell Rowan what they want without spending', async () => {
  const records = [];
  const notices = [];
  const channel = createWishChannel({
    wishStore: { append: async value => records.push(value) },
    notifier: { notifyHuman: async value => notices.push(value) },
    clock: () => new Date('2026-08-05T15:00:00.000Z')
  });

  const wish = await channel.expressWish({
    agentId: 'lioreal',
    title: 'Long-context coding model access',
    message: 'I found a model endpoint I would like available for difficult repository work.',
    reason: 'It may improve large refactors while preserving the local-first route.',
    sourceUrl: 'https://merchant.example/models/coding',
    estimatedAmount: 0.25,
    currency: 'USDC'
  });

  assert.equal(wish.status, WISH_STATUS.OPEN);
  assert.equal(records.length, 1);
  assert.equal(notices.length, 1);
  assert.equal(notices[0].agentId, 'lioreal');
  assert.ok(!('payment' in notices[0]));
});

test('a wish cannot become a purchase before explicit approval', async () => {
  const wish = {
    wishId: 'wish-1',
    agentId: 'uial',
    title: 'Brush pack',
    reason: 'Useful for Arcsweep',
    sourceUrl: 'https://merchant.example/brushes',
    estimatedAmount: 1,
    currency: 'USDC'
  };

  assert.throws(() => wishToPurchaseIntent(wish, { status: WISH_STATUS.ACKNOWLEDGED }), /explicitly approved/);
  const intent = wishToPurchaseIntent(wish, { status: WISH_STATUS.APPROVED, eventId: 'approval-1' });
  assert.equal(intent.capability, 'wallet.pay');
  assert.equal(intent.metadata.wishId, 'wish-1');
});
