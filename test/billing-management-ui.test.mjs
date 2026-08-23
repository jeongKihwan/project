import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');

test('billing management exposes plan change cancellation resume and refund actions',()=>{
  assert.match(page,/id="billing-management"/);
  assert.match(app,/\/api\/subscriptions\/change/);
  assert.match(app,/\/api\/subscriptions\/cancel/);
  assert.match(app,/\/api\/subscriptions\/resume/);
  assert.match(app,/\/api\/refunds/);
  assert.match(app,/Paddle 승인 대기/);
});
