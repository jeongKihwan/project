import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeWithOpenAI } from '../src/providers/openai-review-analyzer.js';

test('expanded review analysis normalizes grounded action results', async () => {
  const originalFetch = globalThis.fetch;
  let authorization = '';
  const raw = {
    summary: '배송은 빠르지만 포장 개선이 필요합니다.',
    summaryEvidenceIds: ['R1', 'R2'],
    sentiment: { positiveCount: 1, neutralCount: 0, negativeCount: 1 },
    strengths: [{ name: '빠른 배송', count: 1, action: '상세페이지 상단에서 배송 속도를 강조하세요.', evidenceIds: ['R1'] }],
    weaknesses: [{ name: '포장 파손', count: 1, severity: '높음', improvement: '포장재를 보강하세요.', evidenceIds: ['R2'] }],
    keywords: [{ name: '배송', count: 1 }, { name: '포장', count: 1 }],
    priorities: [{ rank: 1, title: '포장 개선', expectedEffect: '부정 리뷰 감소 기대', basis: '파손 불만이 확인됐습니다.', evidenceIds: ['R2'] }],
    pageCopy: {
      headline: { text: '빠르게 받고 만족스럽게', evidenceIds: ['R1'] },
      benefits: [{ text: '빠른 배송', evidenceIds: ['R1'] }],
      anxietyRemovers: [{ question: '포장은 안전한가요?', answer: '포장 개선 여부를 구매 전에 확인하세요.', evidenceIds: ['R2'] }],
    },
    faq: [{ question: '배송은 빠른가요?', answer: '빠른 배송 의견이 확인됐습니다.', evidenceIds: ['R1'] }],
  };
  globalThis.fetch = async (_url, options) => {
    authorization = options.headers.Authorization;
    return new Response(JSON.stringify({ output: [{ content: [{ type: 'output_text', text: JSON.stringify(raw) }] }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const result = await analyzeWithOpenAI(['배송이 빨라서 좋아요.', '상자가 찌그러져 왔어요.'], { openai_api_key: 'lowercase-secret' });
    assert.equal(authorization, 'Bearer lowercase-secret');
    assert.equal(result.totalReviews, 2);
    assert.equal(result.analyzedReviews, 2);
    assert.equal(result.sentiment.positive.percent, 50);
    assert.equal(result.sentiment.negative.percent, 50);
    assert.equal(result.strengths[0].action, '상세페이지 상단에서 배송 속도를 강조하세요.');
    assert.equal(result.weaknesses[0].severity, '높음');
    assert.equal(result.priorities[0].rank, 1);
    assert.equal(result.pageCopy.headline.text, '빠르게 받고 만족스럽게');
    assert.equal(result.faq[0].question, '배송은 빠른가요?');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
