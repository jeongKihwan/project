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
  assert.match(app, /state\.pendingTable=\{rows:table\.slice\(1\),headers,fileName,typeLabel\}/);
  assert.match(app, /id="review-column-select"|#review-column-select/);
  assert.match(app, /#confirm-column-button/);
});

test('all input modes normalize to the existing comment CSV analysis request', () => {
  assert.match(app, /function cleanReviews\(values\) \{ const seen=new Set\(\)/);
  assert.match(app, /function reviewsToCsv\(reviews\) \{ return `댓글/);
  assert.match(app, /value\.split\(\/\\r\?\\n\/\)/);
  assert.match(app, /api\('\/api\/analyses',\{method:'POST',body:JSON\.stringify\(\{fileName:state\.file\.name,csv:state\.csv,requestId:/);
});
