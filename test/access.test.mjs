import test from 'node:test';
import assert from 'node:assert/strict';
import { previewResult, resultForAccess } from '../src/access.js';

const fullResult = {
  totalReviews: 100,
  analyzedReviews: 100,
  summary: '요약',
  sentiment: { positive: { count: 70, percent: 70 }, neutral: { count: 20, percent: 20 }, negative: { count: 10, percent: 10 } },
  strengths: Array.from({ length: 5 }, (_, index) => ({ name: `장점${index + 1}` })),
  weaknesses: Array.from({ length: 5 }, (_, index) => ({ name: `불만${index + 1}` })),
  priorities: Array.from({ length: 3 }, (_, index) => ({ rank: index + 1, title: `개선${index + 1}` })),
  pageCopy: { headline: { text: '헤드라인' }, benefits: [{ text: '장점A' }, { text: '장점B' }, { text: '장점C' }], anxietyRemovers: [{ question: '질문' }] },
  keywords: [{ name: '키워드' }],
  faq: [{ question: 'FAQ' }],
};

test('FREE preview returns only allowed result fields', () => {
  const preview = previewResult(fullResult);
  assert.equal(preview.strengths.length, 3);
  assert.equal(preview.weaknesses.length, 3);
  assert.equal(preview.priorities.length, 1);
  assert.equal(preview.pageCopy.benefits.length, 2);
  assert.equal(preview.pageCopy.anxietyRemovers.length, 0);
  assert.equal(preview.faq.length, 0);
  assert.equal(preview.keywords.length, 0);
});

test('paid access receives original full result without regeneration', () => {
  assert.equal(resultForAccess(fullResult, { fullResults: true }), fullResult);
  assert.notEqual(resultForAccess(fullResult, { fullResults: false }), fullResult);
});
