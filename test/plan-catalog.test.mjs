import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(new URL('../migrations/0005_plan_catalog.sql', import.meta.url), 'utf8');
const proLimitMigration = await readFile(new URL('../migrations/0007_pro_limit_120.sql', import.meta.url), 'utf8');

test('paid plan catalog uses English names and requested limits', () => {
  assert.match(migration, /name='Starter', credits=10/);
  assert.match(migration, /name='Growth', credits=50/);
  assert.match(migration, /name='Pro', credits=100/);
  assert.match(proLimitMigration, /credits=120.*id='pro'/);
  assert.doesNotMatch(migration, /credits=200/);
});
