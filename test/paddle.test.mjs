import test from 'node:test';
import assert from 'node:assert/strict';
import { paddleCheckoutConfig, parsePaddleWebhook, updatePaddleSubscription } from '../src/providers/payment/paddle.js';
import { applyPaymentWebhook } from '../src/subscriptions.js';

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

test('sandbox checkout config accepts individual plan price secrets', () => {
  const env = {
    PADDLE_MODE: 'sandbox',
    PADDLE_CLIENT_TOKEN: 'test_client_token',
    PADDLE_STARTER_PRICE_ID: priceId,
    PADDLE_GROWTH_PRICE_ID: `pri_${'b'.repeat(26)}`,
    PADDLE_PRO_PRICE_ID: `pri_${'c'.repeat(26)}`,
  };
  assert.equal(paddleCheckoutConfig(env, 'starter').priceId, priceId);
  assert.equal(paddleCheckoutConfig(env, 'growth').priceId, `pri_${'b'.repeat(26)}`);
  assert.equal(paddleCheckoutConfig(env, 'pro').priceId, `pri_${'c'.repeat(26)}`);
});

test('sandbox checkout config rejects live token', () => {
  assert.throws(() => paddleCheckoutConfig({ PADDLE_MODE: 'sandbox', PADDLE_CLIENT_TOKEN: 'live_client_token', PADDLE_PRICE_IDS: JSON.stringify({ starter: priceId }) }, 'starter'), /PADDLE_MODE_MISMATCH/);
});

test('paid plan change replaces the existing Sandbox subscription price', async () => {
  const originalFetch = globalThis.fetch;
  let captured;
  globalThis.fetch = async (url, options) => {
    captured = { url, options };
    return new Response(JSON.stringify({ data: { id: `sub_${'s'.repeat(26)}`, status: 'active' } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const result = await updatePaddleSubscription({ PADDLE_MODE: 'sandbox', PADDLE_API_KEY: 'pdl_sdbx_apikey_test' }, { subscriptionId: `sub_${'s'.repeat(26)}`, priceId, prorationBillingMode: 'prorated_immediately' });
    assert.equal(captured.url, `https://sandbox-api.paddle.com/subscriptions/sub_${'s'.repeat(26)}`);
    assert.equal(captured.options.method, 'PATCH');
    assert.deepEqual(JSON.parse(captured.options.body), { items: [{ price_id: priceId, quantity: 1 }], proration_billing_mode: 'prorated_immediately', on_payment_failure: 'prevent_change' });
    assert.equal(result.status, 'ACTIVE');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('completed webhook requires valid signature and returns verified fields', async () => {
  const body = JSON.stringify({ event_id: `evt_${'e'.repeat(26)}`, event_type: 'transaction.completed', data: { id: `txn_${'b'.repeat(26)}`, status: 'completed', subscription_id: `sub_${'s'.repeat(26)}`, billing_period: { starts_at: '2026-08-01T00:00:00Z', ends_at: '2026-09-01T00:00:00Z' }, custom_data: { payment_id: 'payment-id', payment_token: 'payment-token' }, items: [{ quantity: 1, price: { id: priceId } }] } });
  const event = await parsePaddleWebhook(await signedRequest(body), { PADDLE_WEBHOOK_SECRET: 'webhook-secret' });
  assert.equal(event.type, 'completed');
  assert.equal(event.paymentId, 'payment-id');
  assert.equal(event.paymentToken, 'payment-token');
  assert.equal(event.providerSubscriptionId, `sub_${'s'.repeat(26)}`);
  assert.equal(event.periodEnd, '2026-09-01T00:00:00Z');
  assert.deepEqual(event.items, [{ priceId, quantity: 1 }]);
});

test('webhook accepts harmless whitespace around the destination secret', async () => {
  const body = JSON.stringify({ event_id: `evt_${'w'.repeat(26)}`, event_type: 'transaction.completed', data: { id: `txn_${'b'.repeat(26)}`, status: 'completed', subscription_id: `sub_${'s'.repeat(26)}`, billing_period: { starts_at: '2026-08-01T00:00:00Z', ends_at: '2026-09-01T00:00:00Z' }, custom_data: { payment_id: 'payment-id', payment_token: 'payment-token' }, items: [{ quantity: 1, price: { id: priceId } }] } });
  const event = await parsePaddleWebhook(await signedRequest(body), { PADDLE_WEBHOOK_SECRET: '  webhook-secret\n' });
  assert.equal(event.eventType, 'transaction.completed');
});

test('webhook distinguishes a missing signature header', async () => {
  const request = new Request('https://example.com/api/webhooks/paddle', { method: 'POST', body: '{}' });
  await assert.rejects(() => parsePaddleWebhook(request, { PADDLE_WEBHOOK_SECRET: 'webhook-secret' }), /PADDLE_WEBHOOK_SIGNATURE_MISSING/);
});

test('completed webhook exposes a one-time price billing cycle', async () => {
  const body = JSON.stringify({ event_id: `evt_${'o'.repeat(26)}`, event_type: 'transaction.completed', data: { id: `txn_${'b'.repeat(26)}`, status: 'completed', subscription_id: null, billing_period: null, custom_data: { payment_id: 'payment-id', payment_token: 'payment-token' }, items: [{ quantity: 1, price: { id: priceId, billing_cycle: null } }] } });
  const event = await parsePaddleWebhook(await signedRequest(body), { PADDLE_WEBHOOK_SECRET: 'webhook-secret' });
  assert.equal(event.providerSubscriptionId, '');
  assert.equal(event.items[0].billingCycle, null);
});

test('subscription update exposes billing period and mapped item', async () => {
  const body = JSON.stringify({ event_id: `evt_${'u'.repeat(26)}`, event_type: 'subscription.updated', data: { id: `sub_${'s'.repeat(26)}`, status: 'active', current_billing_period: { starts_at: '2026-08-01T00:00:00Z', ends_at: '2026-09-01T00:00:00Z' }, scheduled_change: { action: 'cancel' }, items: [{ quantity: 1, price: { id: priceId } }] } });
  const event = await parsePaddleWebhook(await signedRequest(body), { PADDLE_WEBHOOK_SECRET: 'webhook-secret' });
  assert.equal(event.type, 'subscription');
  assert.equal(event.subscriptionStatus, 'ACTIVE');
  assert.equal(event.cancelAtPeriodEnd, true);
  assert.equal(event.items[0].priceId, priceId);
});

test('subscription proration transaction exposes its origin', async () => {
  const body = JSON.stringify({ event_id: `evt_${'p'.repeat(26)}`, event_type: 'transaction.completed', data: { id: `txn_${'b'.repeat(26)}`, origin: 'subscription_update', status: 'completed', subscription_id: `sub_${'s'.repeat(26)}`, custom_data: {}, items: [{ quantity: 1, price: { id: priceId } }, { quantity: 1, price: { id: priceId } }] } });
  const event = await parsePaddleWebhook(await signedRequest(body), { PADDLE_WEBHOOK_SECRET: 'webhook-secret' });
  assert.equal(event.origin, 'subscription_update');
  assert.equal(event.items.length, 2);
});

test('subscription proration transaction is acknowledged without activating a payment', async () => {
  const events = new Set();
  const env = { DB: { prepare(sql) { return { bind(...args) { return {
    first: async () => sql.startsWith('SELECT event_id') ? (events.has(args[0]) ? { event_id: args[0] } : null) : (sql.startsWith('SELECT user_id FROM subscriptions') ? { user_id: 'linked-user' } : null),
    run: async () => { if (sql.startsWith('INSERT INTO payment_webhook_events')) events.add(args[0]); return { success: true }; },
  }; } }; } } };
  const eventId = `evt_${'q'.repeat(26)}`;
  const result = await applyPaymentWebhook(env, { eventId, eventType: 'transaction.completed', type: 'completed', origin: 'subscription_update', providerSubscriptionId: `sub_${'s'.repeat(26)}`, items: [{ quantity: 1 }, { quantity: 1 }] });
  assert.deepEqual(result, { ignored: true, reason: 'SUBSCRIPTION_ADJUSTMENT_TRANSACTION' });
  assert.equal(events.has(eventId), true);
});

test('webhook rejects altered body', async () => {
  const original = JSON.stringify({ event_type: 'transaction.completed', data: { status: 'completed' } });
  const request = await signedRequest(original);
  const altered = new Request(request.url, { method: 'POST', headers: request.headers, body: `${original} ` });
  await assert.rejects(() => parsePaddleWebhook(altered, { PADDLE_WEBHOOK_SECRET: 'webhook-secret' }), /PADDLE_WEBHOOK_SIGNATURE_MISMATCH/);
});
