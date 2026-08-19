import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

for (const page of ['terms.html', 'privacy.html']) {
  test(`${page} keeps legal links the same color after visiting`, async () => {
    const html = await readFile(new URL(`../public/${page}`, import.meta.url), 'utf8');
    assert.match(html, /\.legal a,\.legal a:visited\{color:#1f5745\}/);
    assert.match(html, />서비스로 돌아가기<\/a>/);
  });
}
