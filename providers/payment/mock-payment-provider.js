const crypto = require('node:crypto');

class MockPaymentProvider {
  async createCheckout({ paymentId, amount, planName }) {
    return { mode: 'mock', paymentId, amount, planName };
  }
  async verify({ paymentId, amount, approvalToken }) {
    if (approvalToken !== 'demo-approved') throw new Error('결제 승인을 확인할 수 없습니다.');
    return { providerPaymentId: `mock_${crypto.createHash('sha256').update(paymentId).digest('hex').slice(0, 24)}`, amount, status: 'PAID' };
  }
}

module.exports = { MockPaymentProvider };
