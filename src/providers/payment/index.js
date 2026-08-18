import { confirmMockPayment, mockCheckoutConfig } from './mock.js';
import { confirmTossPayment, tossCheckoutConfig } from './toss.js';

export function paymentCheckoutConfig(env) {
  if (env.PAYMENT_PROVIDER === 'toss') return { provider: 'toss', ...tossCheckoutConfig(env) };
  if (env.PAYMENT_PROVIDER === 'mock') return { provider: 'mock', ...mockCheckoutConfig(env) };
  throw new Error('PAYMENT_PROVIDER_NOT_CONFIGURED');
}

export async function confirmPayment(payment, input, env) {
  if (env.PAYMENT_PROVIDER === 'toss') return confirmTossPayment(payment, input.paymentKey, env);
  if (env.PAYMENT_PROVIDER === 'mock') return confirmMockPayment(payment, input.approvalToken, env);
  throw new Error('PAYMENT_PROVIDER_NOT_CONFIGURED');
}
