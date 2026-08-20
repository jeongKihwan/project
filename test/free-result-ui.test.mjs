import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');

test('FREE results expose requested counts and render locked previews', () => {
  assert.match(source, /고객이 구매 후 좋아한 점 TOP 3/);
  assert.match(source, /고객 불만 TOP 3/);
  assert.match(source, /우선순위 잠금/);
  assert.match(source, /추천 문구 .*개 잠금/);
  assert.match(source, /FAQ .*개 전체 잠금/);
  assert.match(source, /전체 결과 보기 \/ Starter로 업그레이드/);
});

test('paid results return before FREE locking is applied', () => {
  assert.match(source, /renderBaseResult\(result, id\); if \(!locked\) return;/);
});
