import test from 'node:test';
import assert from 'node:assert/strict';
import { createWalletCapability, WALLET_MODE, WalletPolicyError } from '../capabilities/wallet/wallet-capability.mjs';

const intent = { agentId: 'boxfire', resourceUrl: 'https://api.example.com/canon', purpose: 'Acquire canon update', amount: 0.25, currency: 'USDC' };
const policy = { allowedHosts: ['example.com'], allowedCurrencies: ['USDC'], perTransactionLimit: 1, requireApprovalAbove: 0.5 };

function harness(mode, quotedAmount = 0.25) {
  const receipts = [];
  const payments = [];
  const capability = createWalletCapability({
    mode,
    adapter: {
      quote: async () => ({ amount: quotedAmount, currency: 'USDC', quoteId: 'q1' }),
      pay: async purchase => { payments.push(purchase); return { transactionId: 'tx1' }; }
    },
    receiptStore: { append: async receipt => receipts.push(receipt) },
    clock: () => new Date('2026-08-05T13:30:00.000Z')
  });
  return { capability, receipts, payments };
}

test('OFF mode denies and emits a receipt', async () => {
  const { capability, receipts } = harness(WALLET_MODE.OFF);
  await assert.rejects(() => capability.requestPurchase(intent, policy), error => error instanceof WalletPolicyError && error.code === 'WALLET_OFF');
  assert.equal(receipts.length, 1);
  assert.equal(receipts[0].decision, 'WALLET_OFF');
});

test('MANUAL mode never pays without approval', async () => {
  const { capability, payments } = harness(WALLET_MODE.MANUAL);
  const result = await capability.requestPurchase(intent, policy);
  assert.equal(result.status, 'APPROVAL_REQUIRED');
  assert.equal(payments.length, 0);
});

test('SHADOW mode evaluates but does not pay', async () => {
  const { capability, payments } = harness(WALLET_MODE.SHADOW);
  const result = await capability.requestPurchase(intent, policy);
  assert.equal(result.status, 'SHADOW_APPROVED');
  assert.equal(payments.length, 0);
});

test('AUTO mode pays only within policy', async () => {
  const { capability, payments } = harness(WALLET_MODE.AUTO);
  const result = await capability.requestPurchase(intent, policy);
  assert.equal(result.status, 'PAID');
  assert.equal(payments.length, 1);
  assert.equal(result.receipt.decision, 'PAID');
});

test('merchant quote is rechecked against limits', async () => {
  const { capability, payments } = harness(WALLET_MODE.AUTO, 2);
  await assert.rejects(() => capability.requestPurchase(intent, policy), error => error.code === 'LIMIT_EXCEEDED');
  assert.equal(payments.length, 0);
});
