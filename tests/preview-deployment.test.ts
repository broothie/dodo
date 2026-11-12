import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { previewConfig, previewIdentity } from '../scripts/deploy-preview.mjs';

test('preview deployments cannot select main or production D1, and branch names cannot collide after slugging', () => {
  const source = JSON.parse(readFileSync(new URL('../apps/api/wrangler.jsonc', import.meta.url), 'utf8'));
  const branch = 'feat/login';
  const identity = previewIdentity(branch);
  assert.notEqual(identity.name, previewIdentity('feat-login').name);
  assert.notEqual(identity.databaseName, previewIdentity('feat-login').databaseName);
  for (const invalid of ['', 'main', 'HEAD', '--name=main']) assert.throws(() => previewIdentity(invalid));
  const production = { name: identity.databaseName, uuid: source.d1_databases[0].database_id };
  assert.throws(() => previewConfig(source, branch, production));
  const database = { name: identity.databaseName, uuid: '11111111-1111-4111-8111-111111111111' };
  assert.throws(() => previewConfig(source, branch, { ...database, name: 'dodo' }));
  const config = previewConfig(source, branch, database);
  assert.equal(config.d1_databases[0].database_id, database.uuid);
  assert.deepEqual(config.previews.d1_databases, config.d1_databases);
  assert.equal(config.previews.vars.BETTER_AUTH_URL, `https://${identity.name}-dodo.adbooth.workers.dev`);
  assert.equal(config.previews.vars.BETTER_AUTH_ADDITIONAL_ORIGINS, '');
  assert.equal(config.routes, undefined);
  assert.deepEqual(config.secrets.required, ['BETTER_AUTH_SECRET']);
  assert.equal(JSON.stringify(config).includes(source.d1_databases[0].database_id), false);
});
