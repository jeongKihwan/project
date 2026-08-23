import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');

test('review input offers CSV, XLSX, and paste modes', () => {
  assert.match(html, /data-input-mode="csv"/);
  assert.match(html, /data-input-mode="xlsx"/);
  assert.match(html, /data-input-mode="paste"/);
  assert.match(html, /id="review-paste-input"/);
  assert.match(html, /vendor\/xlsx\.full\.min\.js/);
});

test('XLSX parser is vendored and loaded before the existing app', async () => {
  const library = await stat(new URL('../public/vendor/xlsx.full.min.js', import.meta.url));
  assert.ok(library.size > 900_000);
  assert.ok(html.indexOf('vendor/xlsx.full.min.js') < html.indexOf('app.js'));
});

test('file input auto-detects review columns with a manual fallback', () => {
  assert.match(app, /function reviewColumnIndex\(headers\)/);
  assert.match(app, /state\.pendingTable=\{rows:table\.slice\(1\),headers,fileName,typeLabel,columns\}/);
  assert.match(app, /id="review-column-select"|#review-column-select/);
  assert.match(app, /#confirm-column-button/);
});

test('all input modes normalize to the existing comment CSV analysis request', () => {
  assert.match(app, /function cleanReviews\(values\) \{ const seen=new Set\(\)/);
  assert.match(app, /function recordsToCsv\(records\) \{ return `댓글,별점,작성일,상품명/);
  assert.match(app, /value\.split\(\/\\r\?\\n\/\)/);
  assert.match(app, /api\('\/api\/analyses',\{method:'POST',body:JSON\.stringify\(\{fileName:state\.file\.name,csv:state\.csv,requestId:/);
});

test('Naver SmartStore columns map review metadata with manual review fallback', () => {
  assert.match(app, /리뷰상세내용/);
  assert.match(app, /리뷰평점/);
  assert.match(app, /리뷰등록일/);
  assert.match(app, /판매상품명/);
  assert.match(app, /columns=\{\.\.\.pending\.columns,review:index\}/);
});

test('business context supports SmartStore and Naver Place without crawling', () => {
  assert.match(app, /sourceType: 'naver_smartstore'/);
  assert.match(app, /'naver_place':'naver_smartstore'/);
  assert.match(app, /자동 크롤링은 사용하지 않습니다/);
  assert.match(app, /businessType:state\.businessType,sourceType:state\.sourceType/);
  assert.doesNotMatch(app, /crawl|scrape|puppeteer/i);
});
