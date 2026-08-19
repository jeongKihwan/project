import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';

const baseUrl = process.env.TEST_BASE_URL || 'http://localhost:8790';
const webhookSecret = 'test_webhook_secret';
const providerId = (prefix) => `${prefix}_${randomUUID().replaceAll('-', '').slice(0, 26)}`;
const ids = {
  starterPrice: `pri_${'a'.repeat(26)}`,
  growthPrice: `pri_${'b'.repeat(26)}`,
  transaction: providerId('txn'),
  subscription: providerId('sub'),
};
let cookie = '';

async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (cookie && options.auth !== false) headers.Cookie = cookie;
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers });
  const setCookie = response.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  const data = await response.json();
  return { response, data };
}

function signedWebhook(event) {
  const body = JSON.stringify(event);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac('sha256', webhookSecret).update(`${timestamp}:${body}`).digest('hex');
  return request('/api/webhooks/paddle', { method: 'POST', auth: false, headers: { 'Paddle-Signature': `ts=${timestamp};h1=${signature}` }, body });
}

const email = `flow-${Date.now()}@example.com`;
const password = 'subscription-test-password';
const periodStart = new Date(Date.now() - 60_000).toISOString();
const periodEnd = new Date(Date.now() + 30 * 86400_000).toISOString();
const completedAt = new Date(Date.now() - 30_000).toISOString();
const updatedAt = new Date(Date.now() - 20_000).toISOString();
const staleAt = new Date(Date.now() - 15_000).toISOString();
const canceledAt = new Date(Date.now() - 10_000).toISOString();

let result = await request('/api/auth/signup', { method: 'POST', body: JSON.stringify({ email, password, terms: true, privacy: true }) });
assert.equal(result.response.status, 201);

result = await request('/api/me');
assert.equal(result.data.access.planId, 'free');
assert.deepEqual(result.data.access.usage, { used: 0, limit: 1, remaining: 1 });

const firstRequestId = randomUUID();
result = await request('/api/analyses', { method: 'POST', body: JSON.stringify({ requestId: firstRequestId, fileName: 'free.csv', csv: '댓글\n배송이 빨라서 만족합니다\n포장이 아쉬워요' }) });
assert.equal(result.response.status, 201);
assert.equal(result.data.locked, true);
assert.equal(result.data.result.strengths.length <= 3, true);
assert.equal(result.data.result.weaknesses.length <= 3, true);
assert.equal(result.data.result.priorities.length <= 1, true);
assert.equal('copy' in result.data.result, false);
assert.equal('purchasePoints' in result.data.result, false);
const analysisId = result.data.id;

result = await request('/api/analyses', { method: 'POST', body: JSON.stringify({ requestId: randomUUID(), fileName: 'blocked.csv', csv: '댓글\n두 번째 무료 분석' }) });
assert.equal(result.response.status, 402);
assert.equal(result.data.code, 'PLAN_LIMIT_REACHED');

result = await request('/api/payments/checkout', { method: 'POST', body: JSON.stringify({ planId: 'starter' }) });
assert.equal(result.response.status, 201);
const paymentId = result.data.paymentId;

result = await request(`/api/payments/checkout/${paymentId}`);
assert.equal(result.response.status, 200);
const paymentToken = result.data.paymentToken;
assert.equal(result.data.priceId, ids.starterPrice);

const completedEvent = {
  event_id: providerId('evt'),
  event_type: 'transaction.completed',
  occurred_at: completedAt,
  data: {
    id: ids.transaction,
    status: 'completed',
    subscription_id: ids.subscription,
    billing_period: { starts_at: periodStart, ends_at: periodEnd },
    custom_data: { payment_id: paymentId, payment_token: paymentToken },
    items: [{ quantity: 1, price: { id: ids.starterPrice } }],
  },
};
result = await signedWebhook(completedEvent);
assert.equal(result.response.status, 200);
assert.equal(result.data.activated, true);

result = await request('/api/me');
assert.equal(result.data.access.planId, 'starter');
assert.equal(result.data.access.fullResults, true);
assert.equal(result.data.access.usage.limit, 10);

result = await request('/api/analyses');
assert.equal(result.response.status, 200);
assert.equal(result.data[0].id, analysisId);
assert.equal(result.data[0].locked, false);
assert.equal(Array.isArray(result.data[0].result.copy), true);

await request('/api/auth/logout', { method: 'POST' });
cookie = '';
result = await request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
assert.equal(result.response.status, 200);
result = await request('/api/me');
assert.equal(result.data.access.planId, 'starter');
result = await request('/api/analyses');
assert.equal(result.data[0].locked, false);

result = await signedWebhook(completedEvent);
assert.equal(result.response.status, 200);
assert.equal(result.data.duplicate, true);

result = await signedWebhook({
  event_id: providerId('evt'),
  event_type: 'subscription.updated',
  occurred_at: updatedAt,
  data: { id: ids.subscription, status: 'active', current_billing_period: { starts_at: periodStart, ends_at: periodEnd }, scheduled_change: null, items: [{ quantity: 1, price: { id: ids.growthPrice } }] },
});
assert.equal(result.response.status, 200);
result = await request('/api/me');
assert.equal(result.data.access.planId, 'growth');
assert.equal(result.data.access.usage.limit, 50);

result = await signedWebhook({
  event_id: providerId('evt'),
  event_type: 'transaction.completed',
  occurred_at: new Date(Date.now() - 18_000).toISOString(),
  data: { id: providerId('txn'), origin: 'subscription_update', status: 'completed', subscription_id: ids.subscription, custom_data: {}, items: [{ quantity: 1, price: { id: ids.starterPrice } }, { quantity: 1, price: { id: ids.growthPrice } }] },
});
assert.equal(result.response.status, 200);
assert.equal(result.data.reason, 'SUBSCRIPTION_ADJUSTMENT_TRANSACTION');

result = await signedWebhook({
  event_id: providerId('evt'),
  event_type: 'subscription.canceled',
  occurred_at: canceledAt,
  data: { id: ids.subscription, status: 'canceled', current_billing_period: { starts_at: periodStart, ends_at: periodEnd }, scheduled_change: null, items: [{ quantity: 1, price: { id: ids.growthPrice } }] },
});
assert.equal(result.response.status, 200);
result = await request('/api/me');
assert.equal(result.data.access.planId, 'free');
result = await request('/api/analyses');
assert.equal(result.data[0].locked, true);

result = await signedWebhook({
  event_id: providerId('evt'),
  event_type: 'subscription.updated',
  occurred_at: staleAt,
  data: { id: ids.subscription, status: 'active', current_billing_period: { starts_at: periodStart, ends_at: periodEnd }, scheduled_change: null, items: [{ quantity: 1, price: { id: ids.starterPrice } }] },
});
assert.equal(result.response.status, 200);
assert.equal(result.data.reason, 'STALE_SUBSCRIPTION_EVENT');
result = await request('/api/me');
assert.equal(result.data.access.planId, 'free');

await request('/api/auth/logout', { method: 'POST' });
cookie = '';
result = await request('/api/auth/signup', { method: 'POST', body: JSON.stringify({ email: `concurrent-${Date.now()}@example.com`, password, terms: true, privacy: true }) });
assert.equal(result.response.status, 201);
const concurrentCookie = cookie;
const concurrentAnalyze = (requestId) => fetch(`${baseUrl}/api/analyses`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: concurrentCookie }, body: JSON.stringify({ requestId, fileName: 'concurrent.csv', csv: '댓글\n동시 요청 테스트' }) });
const concurrentResponses = await Promise.all([concurrentAnalyze(randomUUID()), concurrentAnalyze(randomUUID())]);
assert.deepEqual(concurrentResponses.map((response) => response.status).sort(), [201, 402]);

console.log('FREE → 잠금 → Starter 활성화 → 기존 결과 해제 → 재로그인 유지 → 중복/역순 웹훅 → Growth 변경 → 취소 → 동시요청 차단 검증 완료');
