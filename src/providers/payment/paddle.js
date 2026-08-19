const encoder = new TextEncoder();

function hexToBytes(value) {
  if (!/^[a-f0-9]{64}$/i.test(value || '')) return null;
  return Uint8Array.from(value.match(/.{2}/g), (byte) => Number.parseInt(byte, 16));
}

function priceMap(env) {
  try {
    const parsed = JSON.parse(env.PADDLE_PRICE_IDS || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    throw new Error('PADDLE_PRICE_MAP_INVALID');
  }
}

export function planForPaddlePrice(env, priceId) {
  const match = Object.entries(priceMap(env)).find(([planId, mappedPriceId]) => ['starter', 'growth', 'pro'].includes(planId) && mappedPriceId === priceId);
  return match?.[0] || null;
}

export function paddleCheckoutConfig(env, planId) {
  const mode = env.PADDLE_MODE || 'sandbox';
  const clientToken = String(env.PADDLE_CLIENT_TOKEN || '');
  if (!['sandbox', 'live'].includes(mode)) throw new Error('PADDLE_MODE_INVALID');
  if (!clientToken) throw new Error('PADDLE_CLIENT_TOKEN_MISSING');
  if (mode === 'sandbox' && !clientToken.startsWith('test_')) throw new Error('PADDLE_MODE_MISMATCH');
  if (mode === 'live' && !clientToken.startsWith('live_')) throw new Error('PADDLE_MODE_MISMATCH');
  const priceId = String(priceMap(env)[planId] || '');
  if (!/^pri_[a-z0-9]{26}$/.test(priceId)) throw new Error('PADDLE_PRICE_ID_MISSING');
  return { clientToken, mode, priceId };
}

export async function parsePaddleWebhook(request, env) {
  if (!env.PADDLE_WEBHOOK_SECRET) throw new Error('PADDLE_WEBHOOK_SECRET_MISSING');
  const rawBody = await request.text();
  const signatureHeader = request.headers.get('Paddle-Signature') || '';
  const signatures = { ts: [], h1: [] };
  for (const part of signatureHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 1) continue;
    const key = part.slice(0, separator).trim();
    if (signatures[key]) signatures[key].push(part.slice(separator + 1).trim());
  }
  const timestamp = Number(signatures.ts[0]);
  if (!Number.isFinite(timestamp) || Math.abs(Math.floor(Date.now() / 1000) - timestamp) > 300) throw new Error('PADDLE_WEBHOOK_TIMESTAMP_INVALID');
  const key = await crypto.subtle.importKey('raw', encoder.encode(env.PADDLE_WEBHOOK_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const payload = encoder.encode(`${timestamp}:${rawBody}`);
  let verified = false;
  for (const candidate of signatures.h1) {
    const bytes = hexToBytes(candidate);
    if (bytes && await crypto.subtle.verify('HMAC', key, bytes, payload)) { verified = true; break; }
  }
  if (!verified) throw new Error('PADDLE_WEBHOOK_SIGNATURE_INVALID');
  const event = JSON.parse(rawBody);
  const common = {
    eventId: String(event.event_id || ''),
    eventType: String(event.event_type || ''),
    occurredAt: String(event.occurred_at || ''),
    periodStart: String(event.data?.current_billing_period?.starts_at || event.data?.billing_period?.starts_at || ''),
    periodEnd: String(event.data?.current_billing_period?.ends_at || event.data?.billing_period?.ends_at || ''),
    items: (event.data?.items || []).map((item) => ({ priceId: String(item.price?.id || ''), quantity: Number(item.quantity || 0) })),
  };
  if (event.event_type === 'transaction.completed') {
    if (event.data?.status !== 'completed') throw new Error('PADDLE_TRANSACTION_NOT_COMPLETED');
    return {
      ...common,
      type: 'completed',
      paymentId: String(event.data?.custom_data?.payment_id || ''),
      paymentToken: String(event.data?.custom_data?.payment_token || ''),
      providerPaymentId: String(event.data?.id || ''),
      providerSubscriptionId: String(event.data?.subscription_id || ''),
    };
  }
  if (String(event.event_type || '').startsWith('subscription.')) {
    return {
      ...common,
      type: 'subscription',
      providerSubscriptionId: String(event.data?.id || ''),
      subscriptionStatus: String(event.data?.status || '').toUpperCase(),
      cancelAtPeriodEnd: event.data?.scheduled_change?.action === 'cancel',
    };
  }
  return { ...common, type: 'ignored' };
}
