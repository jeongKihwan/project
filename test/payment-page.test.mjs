import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const rootPage = readFileSync(new URL('../payment.html', import.meta.url), 'utf8');
const publicPage = readFileSync(new URL('../public/payment.html', import.meta.url), 'utf8');
const scripts = [...publicPage.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map((match) => match[1]).filter(Boolean);

test('payment source and deployed asset stay identical', () => {
  assert.equal(publicPage, rootPage);
});

test('payment inline script is valid JavaScript', () => {
  for (const script of scripts) assert.doesNotThrow(() => new vm.Script(script));
});

test('Live checkout uses Paddle production default and exposes click errors', () => {
  assert.ok(!publicPage.includes('Paddle.Environment.set'));
  assert.ok(!publicPage.includes("startsWith('test_')"));
  assert.ok(publicPage.includes("data.environment!=='live'"));
  assert.ok(publicPage.includes("startsWith('live_')"));
  assert.ok(publicPage.includes("/^pri_[a-z0-9]{26}$/"));
  assert.ok(publicPage.includes("button.addEventListener('click'"));
  assert.ok(publicPage.includes('paddle.Checkout.open('));
  assert.ok(publicPage.includes("event.name==='checkout.error'"));
  assert.ok(publicPage.includes('waitForPaddle'));
});
