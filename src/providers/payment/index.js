import { confirmMockPayment, mockCheckoutConfig } from './mock.js';
import { paddleCheckoutConfig, parsePaddleWebhook } from './paddle.js';
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
