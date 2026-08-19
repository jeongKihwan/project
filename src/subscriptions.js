import { planForPaymentPrice } from './providers/payment/index.js';

const encoder = new TextEncoder();
const bytesToBase64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const now = () => new Date().toISOString();

export async function paymentToken(payment, env) {
  if (!env.SESSION_SECRET) throw new Error('SESSION_SECRET_MISSING');
  const key = await crypto.subtle.importKey('raw', encoder.encode(env.SESSION_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(`${payment.id}:${payment.user_id}:${payment.provider}:${payment.provider_price_id || ''}`));
  return bytesToBase64(signature).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function validPeriod(start, end) {
  const startAt = Date.parse(start || '');
  const endAt = Date.parse(end || '');
  return Number.isFinite(startAt) && Number.isFinite(endAt) && startAt < endAt;
}

function validEvent(event) {
  if (!/^[A-Za-z0-9_-]{6,80}$/.test(event.eventId || '')) throw new Error('PADDLE_EVENT_ID_INVALID');
  if (event.items.length !== 1 || event.items[0].quantity !== 1) throw new Error('PADDLE_ITEMS_INVALID');
}

async function duplicateEvent(env, eventId) {
  return Boolean(await env.DB.prepare('SELECT event_id FROM payment_webhook_events WHERE event_id=?').bind(eventId).first());
}

export async function applyPaymentWebhook(env, event) {
  if (event.type === 'ignored') return { ignored: true };
  validEvent(event);
  if (await duplicateEvent(env, event.eventId)) return { duplicate: true };

  if (event.type === 'completed') {
    if (!/^[0-9a-f-]{36}$/i.test(event.paymentId)) throw new Error('PADDLE_PAYMENT_ID_INVALID');
    if (!/^txn_[a-z0-9]{26}$/.test(event.providerPaymentId)) throw new Error('PADDLE_TRANSACTION_ID_INVALID');
    if (!event.providerSubscriptionId) {
      if ('billingCycle' in event.items[0] && !event.items[0].billingCycle) throw new Error('PADDLE_ONE_TIME_PRICE_NOT_ALLOWED');
      throw new Error('PADDLE_SUBSCRIPTION_ID_MISSING');
    }
    if (!/^sub_[a-z0-9]{26}$/.test(event.providerSubscriptionId)) throw new Error('PADDLE_SUBSCRIPTION_ID_INVALID');
    if (!validPeriod(event.periodStart, event.periodEnd)) throw new Error('PADDLE_BILLING_PERIOD_INVALID');
    const payment = await env.DB.prepare('SELECT payments.* FROM payments WHERE payments.id=?').bind(event.paymentId).first();
    if (!payment || payment.provider !== 'paddle') throw new Error('PAYMENT_NOT_FOUND');
    if (event.paymentToken !== await paymentToken(payment, env)) throw new Error('PAYMENT_TOKEN_INVALID');
    const priceId = event.items[0].priceId;
    const planId = planForPaymentPrice(env, priceId);
    if (!planId) throw new Error('PADDLE_PRICE_NOT_MAPPED');
    if (planId !== payment.plan_id || priceId !== payment.provider_price_id) throw new Error('PAYMENT_PLAN_MISMATCH');
    try {
      await env.DB.batch([
        env.DB.prepare("UPDATE payments SET status='PAID',provider_payment_id=?,provider_subscription_id=?,billing_period_start=?,billing_period_end=?,credited_at=? WHERE id=? AND status='PENDING'").bind(event.providerPaymentId, event.providerSubscriptionId, event.periodStart, event.periodEnd, now(), payment.id),
        env.DB.prepare("INSERT INTO subscriptions (user_id,plan_id,status,provider,provider_subscription_id,provider_price_id,current_period_start,current_period_end,cancel_at_period_end,updated_at,provider_event_at) VALUES (?,?,'ACTIVE','paddle',?,?,?, ?,0,?,?) ON CONFLICT(user_id) DO UPDATE SET plan_id=excluded.plan_id,status='ACTIVE',provider='paddle',provider_subscription_id=excluded.provider_subscription_id,provider_price_id=excluded.provider_price_id,current_period_start=excluded.current_period_start,current_period_end=excluded.current_period_end,cancel_at_period_end=0,updated_at=excluded.updated_at,provider_event_at=excluded.provider_event_at").bind(payment.user_id, planId, event.providerSubscriptionId, priceId, event.periodStart, event.periodEnd, now(), event.occurredAt || now()),
        env.DB.prepare('INSERT INTO payment_webhook_events (event_id,event_type,processed_at) VALUES (?,?,?)').bind(event.eventId, event.eventType, now()),
      ]);
      return { activated: true, planId, userId: payment.user_id };
    } catch (error) {
      if (await duplicateEvent(env, event.eventId)) return { duplicate: true };
      throw error;
    }
  }

  if (event.type === 'subscription') {
    if (!/^sub_[a-z0-9]{26}$/.test(event.providerSubscriptionId)) throw new Error('PADDLE_SUBSCRIPTION_INVALID');
    const subscription = await env.DB.prepare("SELECT * FROM subscriptions WHERE provider='paddle' AND provider_subscription_id=?").bind(event.providerSubscriptionId).first();
    if (!subscription) {
      await env.DB.prepare('INSERT INTO payment_webhook_events (event_id,event_type,processed_at) VALUES (?,?,?)').bind(event.eventId, event.eventType, now()).run();
      return { ignored: true, reason: 'SUBSCRIPTION_NOT_LINKED' };
    }
    if (event.occurredAt && subscription.provider_event_at && Date.parse(event.occurredAt) < Date.parse(subscription.provider_event_at)) {
      await env.DB.prepare('INSERT INTO payment_webhook_events (event_id,event_type,processed_at) VALUES (?,?,?)').bind(event.eventId, event.eventType, now()).run();
      return { ignored: true, reason: 'STALE_SUBSCRIPTION_EVENT' };
    }
    const priceId = event.items[0].priceId;
    const planId = planForPaymentPrice(env, priceId);
    if (!planId) throw new Error('PADDLE_PRICE_NOT_MAPPED');
    const status = event.subscriptionStatus || 'PAST_DUE';
    const active = ['ACTIVE', 'TRIALING'].includes(status);
    const periodStart = validPeriod(event.periodStart, event.periodEnd) ? event.periodStart : subscription.current_period_start;
    const periodEnd = validPeriod(event.periodStart, event.periodEnd) ? event.periodEnd : subscription.current_period_end;
    try {
      await env.DB.batch([
        env.DB.prepare('UPDATE subscriptions SET plan_id=?,status=?,provider_price_id=?,current_period_start=?,current_period_end=?,cancel_at_period_end=?,updated_at=?,provider_event_at=? WHERE user_id=?').bind(planId, status, priceId, periodStart, periodEnd, active && event.cancelAtPeriodEnd ? 1 : 0, now(), event.occurredAt || now(), subscription.user_id),
        env.DB.prepare('INSERT INTO payment_webhook_events (event_id,event_type,processed_at) VALUES (?,?,?)').bind(event.eventId, event.eventType, now()),
      ]);
      return { updated: true, planId, status, userId: subscription.user_id };
    } catch (error) {
      if (await duplicateEvent(env, event.eventId)) return { duplicate: true };
      throw error;
    }
  }

  return { ignored: true };
}
