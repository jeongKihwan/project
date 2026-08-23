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

test('logout clears private results and rerenders pricing without the previous plan', () => {
  assert.match(source, /else \{ \$\('#history-list'\)\.innerHTML = ''; \$\('#result'\)\.classList\.add\('hidden'\); \} await loadPlans\(\); bindActions\(\);/);
  assert.match(source, /await refreshMe\(\); location\.hash = 'home'; toast\('로그아웃했습니다\.'\)/);
});

test('anonymous history navigation opens the login dialog', () => {
  assert.match(source, /a\[href="#history"\]/);
  assert.match(source, /if \(state\.user\) return; event\.preventDefault\(\); renderAuth\('login'\); \$\('#auth-dialog'\)\.showModal\(\)/);
});

test('signed-in navigation exposes a working logout action', () => {
  assert.match(source, /class="text-button nav-logout" data-logout>로그아웃/);
  assert.match(source, /document\.querySelectorAll\('\[data-logout\]'\)/);
  assert.match(source, /async function logout\(\) \{ await api\('\/api\/auth\/logout'/);
  assert.match(source, /\$\('#logout-button'\)\.onclick = logout/);
});
