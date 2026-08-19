import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');

test('login form exposes an inline retryable error state', () => {
  assert.match(source, /id="auth-error"/);
  assert.match(source, /aria-live="polite"/);
  assert.match(source, /finally\{button\.disabled=false/);
  assert.match(source, /이메일 또는 비밀번호가 올바르지 않습니다|errorNode\.textContent=error\.message/);
});

test('login validation reports short passwords instead of silently blocking submit', () => {
  assert.match(source, /novalidate/);
  assert.match(source, /비밀번호는 8자 이상 입력해주세요/);
});
