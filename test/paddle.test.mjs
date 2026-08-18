import test from 'node:test';
import assert from 'node:assert/strict';
import { paddleCheckoutConfig, parsePaddleWebhook } from '../src/providers/payment/paddle.js';

const encoder = new TextEncoder();
const priceId = `pri_${'a'.repeat(26)}`;

async function signedRequest(body, secret = 'webhook-secret') {
  const timestamp = Math.floor(Date.now() / 1000);
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}:${body}`));
  const hex = [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return new Request('https://example.com/api/webhooks/paddle', { method: 'POST', headers: { 'Paddle-Signature': `ts=${timestamp};h1=${hex}` }, body });
}

test('sandbox checkout config accepts matching token and price', () => {
  const config = paddleCheckoutConfig({ PADDLE_MODE: 'sandbox', PADDLE_CLIENT_TOKEN: 'test_client_token', PADDLE_PRICE_IDS: JSON.stringify({ starter: priceId }) }, 'starter');
  assert.deepEqual(config, { clientToken: 'test_client_token', mode: 'sandbox', priceId });
});

test('sandbox checkout config rejects live token', () => {
  assert.throws(() => paddleCheckoutConfig({ PADDLE_MODE: 'sandbox', PADDLE_CLIENT_TOKEN: 'live_client_token', PADDLE_PRICE_IDS: JSON.stringify({ starter: priceId }) }, 'starter'), /PADDLE_MODE_MISMATCH/);
});

test('completed webhook requires valid signature and returns verified fields', async () => {
  const body = JSON.stringify({ event_type: 'transaction.completed', data: { id: `txn_${'b'.repeat(26)}`, status: 'completed', custom_data: { payment_id: 'payment-id', payment_token: 'payment-token' }, items: [{ quantity: 1, price: { id: priceId } }] } });
  const event = await parsePaddleWebhook(await signedRequest(body), { PADDLE_WEBHOOK_SECRET: 'webhook-secret' });
  assert.equal(event.type, 'completed');
  assert.equal(event.paymentId, 'payment-id');
  assert.equal(event.paymentToken, 'payment-token');
  assert.deepEqual(event.items, [{ priceId, quantity: 1 }]);
});

test('webhook rejects altered body', async () => {
  const original = JSON.stringify({ event_type: 'transaction.completed', data: { status: 'completed' } });
  const request = await signedRequest(original);
  const altered = new Request(request.url, { method: 'POST', headers: request.headers, body: `${original} ` });
  await assert.rejects(() => parsePaddleWebhook(altered, { PADDLE_WEBHOOK_SECRET: 'webhook-secret' }), /PADDLE_WEBHOOK_SIGNATURE_INVALID/);
});
