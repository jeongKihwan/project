import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
const css = await readFile(new URL('../public/saas.css', import.meta.url), 'utf8');
const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');

test('landing page uses the Review Insight B2B SaaS presentation', () => {
  assert.match(html, /Review Insight/);
  assert.doesNotMatch(html, />리뷰인사이트</);
  assert.match(html, /무료로 1회 분석하기/);
  assert.match(html, /온라인 셀러를 위한 리뷰 분석 AI/);
  assert.match(html, /saas\.css/);
});

test('dashboard exposes visual usage and improved upload guidance', () => {
  assert.match(html, /id="usage-progress-bar"/);
  assert.match(html, /내 컴퓨터에서 파일 선택/);
  assert.match(app, /progress\.style\.width/);
});

test('pricing presentation keeps existing plan actions and adds comparison details', () => {
  assert.match(app, /data-plan=/);
  assert.match(app, /상세페이지 문구와 FAQ 전체 공개/);
  assert.match(css, /--brand: #2563eb/);
  assert.match(css, /@media \(max-width: 760px\)/);
});

test('cross-browser layout keeps HOW IT WORKS full width and four plans visible', () => {
  assert.match(css, /\.how \{ width: 100%; max-width: none;/);
  assert.match(css, /@media \(max-width: 980px\)[\s\S]*\.plan-grid \{ grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
});

test('local file preview keeps navigation active and explains missing API plans', () => {
  assert.match(app, /bindActions\(\);\nloadConfig\(\)/);
  assert.match(app, /location\.protocol==='file:'/);
  assert.match(app, /운영 사이트에서 요금제 보기/);
});
