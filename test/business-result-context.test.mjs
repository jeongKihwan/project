import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { previewResult } from '../src/access.js';

const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
const worker = await readFile(new URL('../src/worker.js', import.meta.url), 'utf8');
const analyzer = await readFile(new URL('../src/providers/openai-review-analyzer.js', import.meta.url), 'utf8');

test('FREE preview preserves business context without DB schema changes', () => {
  const preview = previewResult({ context:{ businessType:'cafe', sourceType:'naver_place' }, strengths:[], weaknesses:[], priorities:[], pageCopy:{ benefits:[], anxietyRemovers:[] }, faq:[] });
  assert.deepEqual(preview.context, { businessType:'cafe', sourceType:'naver_place' });
  assert.match(worker, /result\.context=context/);
  assert.doesNotMatch(worker, /ALTER TABLE/);
});

test('local business result vocabulary uses store and promotion language', () => {
  assert.match(app, /고객 만족 포인트/);
  assert.match(app, /매장·서비스 개선 우선순위/);
  assert.match(app, /홍보 문구/);
  assert.match(app, /방문 전 불안 해소/);
});

test('AI reuses existing schema with business-specific instructions', () => {
  assert.match(analyzer, /analyzeWithOpenAI\(reviews, env, context = \{\}\)/);
  assert.match(analyzer, /네이버 플레이스 기반 자영업 매장/);
  assert.match(analyzer, /네이버 스마트스토어 기반 온라인 상품/);
  assert.match(analyzer, /schema: analysisSchema/);
});
