import { confirmMockPayment, mockCheckoutConfig } from './mock.js';
import { cancelPaddleSubscription, clearPaddleScheduledChange, createPaddleRefund, paddleApiKeyReady, paddleCheckoutConfig, paddleLiveStatus, paddleWebhookReady, parsePaddleWebhook, planForPaddlePrice, updatePaddleSubscription } from './paddle.js';
import { confirmTossPayment, tossCheckoutConfig } from './toss.js';

export function paymentCheckoutConfig(env, planId) {
  if (env.PAYMENT_PROVIDER === 'paddle') return { provider: 'paddle', ...paddleCheckoutConfig(env, planId) };
  if (env.PAYMENT_PROVIDER === 'toss') return { provider: 'toss', ...tossCheckoutConfig(env) };
  if (env.PAYMENT_PROVIDER === 'mock') return { provider: 'mock', ...mockCheckoutConfig(env) };
  throw new Error('PAYMENT_PROVIDER_NOT_CONFIGURED');
}

export async function confirmPayment(payment, input, env) {
  if (payment.provider === 'toss') return confirmTossPayment(payment, input.paymentKey, env);
  if (payment.provider === 'mock') return confirmMockPayment(payment, input.approvalToken, env);
  throw new Error('PAYMENT_PROVIDER_NOT_CONFIGURED');
}

export async function parsePaymentWebhook(request, env) {
  if (env.PAYMENT_PROVIDER === 'paddle') return parsePaddleWebhook(request, env);
  throw new Error('PAYMENT_WEBHOOK_NOT_CONFIGURED');
}

export function planForPaymentPrice(env, priceId) {
  if (env.PAYMENT_PROVIDER === 'paddle') return planForPaddlePrice(env, priceId);
  return null;
}

export async function updatePaymentSubscription(env, input) {
  if (env.PAYMENT_PROVIDER === 'paddle') return updatePaddleSubscription(env, input);
  throw new Error('PAYMENT_SUBSCRIPTION_UPDATE_NOT_SUPPORTED');
}

export async function clearPaymentScheduledChange(env, input) {
  if (env.PAYMENT_PROVIDER === 'paddle') return clearPaddleScheduledChange(env, input);
  throw new Error('PAYMENT_SUBSCRIPTION_UPDATE_NOT_SUPPORTED');
}

export async function cancelPaymentSubscription(env, input) {
  if (env.PAYMENT_PROVIDER === 'paddle') return cancelPaddleSubscription(env, input);
  throw new Error('PAYMENT_SUBSCRIPTION_CANCEL_NOT_SUPPORTED');
}

export async function createPaymentRefund(env, input) {
  if (env.PAYMENT_PROVIDER === 'paddle') return createPaddleRefund(env, input);
  throw new Error('PAYMENT_REFUND_NOT_SUPPORTED');
}

export function paymentSubscriptionUpdateReady(env) {
  return env.PAYMENT_PROVIDER === 'paddle' && paddleApiKeyReady(env);
}

export function paymentWebhookReady(env) {
  return env.PAYMENT_PROVIDER === 'paddle' && paddleWebhookReady(env);
}

export function paymentEnvironmentStatus(env) {
  return env.PAYMENT_PROVIDER === 'paddle' ? paddleLiveStatus(env) : {};
}
