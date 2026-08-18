class TossPaymentProvider {
  constructor({ clientKey, secretKey }) { this.clientKey = clientKey; this.secretKey = secretKey; }

  async createCheckout({ paymentId, amount, planName, customerKey }) {
    return {
      mode: 'toss',
      paymentId,
      amount,
      planName,
      checkoutUrl: `/payment.html?orderId=${encodeURIComponent(paymentId)}&amount=${amount}&orderName=${encodeURIComponent(`${planName} 크레딧`)}&customerKey=${encodeURIComponent(customerKey)}&clientKey=${encodeURIComponent(this.clientKey)}`
    };
  }

  async verify({ paymentId, amount, paymentKey }) {
    if (!paymentKey) throw new Error('토스 결제 키를 확인할 수 없습니다.');
    const authorization = Buffer.from(`${this.secretKey}:`).toString('base64');
    const response = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
      method: 'POST',
      headers: { Authorization: `Basic ${authorization}`, 'Content-Type': 'application/json', 'Idempotency-Key': paymentId },
      body: JSON.stringify({ paymentKey, orderId: paymentId, amount })
    });
    const data = await response.json();
    if (!response.ok || data.status !== 'DONE' || data.orderId !== paymentId || data.totalAmount !== amount) throw new Error(data.message || '토스 결제 검증에 실패했습니다.');
    return { providerPaymentId: data.paymentKey, amount: data.totalAmount, status: 'PAID' };
  }
}

module.exports = { TossPaymentProvider };
