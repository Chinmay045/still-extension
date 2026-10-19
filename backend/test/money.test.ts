import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { toPaise, verifyCheckoutSignature, verifyWebhookSignature, forfeitRef } from '../lib/money.ts';

test('toPaise accepts whole rupees in range only', () => {
  assert.equal(toPaise(50, 1, 1000), 5000);
  assert.equal(toPaise('500', 10, 5000), 50000);
  assert.equal(toPaise(9, 10, 5000), null);
  assert.equal(toPaise(5001, 10, 5000), null);
  assert.equal(toPaise(12.5, 10, 5000), null);
  assert.equal(toPaise('abc', 10, 5000), null);
});

test('checkout signature matches Razorpay formula', () => {
  const sig = createHmac('sha256', 'sec').update('order_1|pay_1').digest('hex');
  assert.equal(verifyCheckoutSignature('order_1', 'pay_1', sig, 'sec'), true);
  assert.equal(verifyCheckoutSignature('order_1', 'pay_2', sig, 'sec'), false);
  assert.equal(verifyCheckoutSignature('order_1', 'pay_1', sig, 'other'), false);
  assert.equal(verifyCheckoutSignature('order_1', 'pay_1', '', 'sec'), false);
});

test('webhook signature covers the raw body', () => {
  const body = '{"event":"payment.captured"}';
  const sig = createHmac('sha256', 'wh').update(body).digest('hex');
  assert.equal(verifyWebhookSignature(body, sig, 'wh'), true);
  assert.equal(verifyWebhookSignature(body + ' ', sig, 'wh'), false);
  assert.equal(verifyWebhookSignature(body, sig, ''), false);
});

test('forfeit ref is scoped to the user', () => {
  assert.notEqual(forfeitRef('a', 'task'), forfeitRef('b', 'task'));
});
