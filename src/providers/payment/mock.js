export function mockCheckoutConfig(env) {
  if (env.ENVIRONMENT !== 'development') throw new Error('MOCK_PAYMENT_FORBIDDEN');
  return { mode: 'mock' };
}

export async function confirmMockPayment(payment, approvalToken, env) {
  mockCheckoutConfig(env);
  if (approvalToken !== 'demo-approved') throw new Error('MOCK_PAYMENT_NOT_APPROVED');
  return { id: `mock_${payment.id}`, amount: payment.amount };
}
