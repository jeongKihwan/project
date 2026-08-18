const TOSS_CONFIRM_URL = 'https://api.tosspayments.com/v1/payments/confirm';

function keyMode(key) {
  if (String(key || '').startsWith('live_')) return 'live';
  if (String(key || '').startsWith('test_')) return 'test';
  return null;
}

export function tossCheckoutConfig(env) {
  const clientMode = keyMode(env.TOSS_CLIENT_KEY);
  const secretMode = keyMode(env.TOSS_SECRET_KEY);
  const expectedMode = env.TOSS_MODE || 'test';
  if (!clientMode || !secretMode) throw new Error('TOSS_KEYS_MISSING');
  if (clientMode !== secretMode) throw new Error('TOSS_KEYS_MISMATCH');
  if (clientMode !== expectedMode) throw new Error('TOSS_MODE_MISMATCH');
  return { clientKey: env.TOSS_CLIENT_KEY, mode: clientMode };
}

export async function confirmTossPayment(payment, paymentKey, env) {
  tossCheckoutConfig(env);
  if (!paymentKey || typeof paymentKey !== 'string' || paymentKey.length > 200) throw new Error('TOSS_PAYMENT_KEY_INVALID');
  const response = await fetch(TOSS_CONFIRM_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${env.TOSS_SECRET_KEY}:`)}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': payment.id,
    },
    body: JSON.stringify({ paymentKey, orderId: payment.id, amount: payment.amount }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = String(result.code || `HTTP_${response.status}`).replace(/[^A-Z0-9_-]/gi, '').slice(0, 80);
    throw new Error(`TOSS_CONFIRM_FAILED_${code}`);
  }
  if (result.status !== 'DONE' || result.orderId !== payment.id || result.totalAmount !== payment.amount) throw new Error('TOSS_CONFIRM_MISMATCH');
  return { id: result.paymentKey, amount: result.totalAmount };
}
