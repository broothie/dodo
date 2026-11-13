import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { accountId, apiClients, cleanupDatabase, cleanupIdentity, cleanupPullRequest, eventPullRequests, repository } from '../scripts/cleanup-preview.mjs';
import { previewIdentity } from '../scripts/deploy-preview.mjs';

const source = JSON.parse(readFileSync(new URL('../apps/api/wrangler.jsonc', import.meta.url), 'utf8'));
const branch = 'fix/login-code-refresh';
const identity = previewIdentity(branch);
const sha = 'a'.repeat(40);
const pr = { number: 2, state: 'closed', commits: 1, base: { repo: { full_name: repository } }, head: { ref: branch, sha, repo: { full_name: repository } } };
const database = { name: identity.databaseName, uuid: '11111111-1111-4111-8111-111111111111' };
const previewPath = `/accounts/${accountId}/workers/workers/dodo/previews/${identity.name}`;
const databasePath = `/accounts/${accountId}/d1/database/${database.uuid}`;

function fixture(options: { open?: boolean; active?: boolean; reopened?: boolean; databases?: object[]; failPreview?: boolean; pull?: typeof pr } = {}) {
  const calls: { path: string; method: string }[] = [];
  let prReads = 0;
  return {
    calls, source, log: () => {},
    github: async (path: string) => {
      if (path === `/repos/${repository}/pulls/2`) return options.reopened && prReads++ ? { ...pr, state: 'open' } : options.pull ?? pr;
      if (path.includes('/pulls?')) return options.open ? [{ ...pr, state: 'open' }] : [];
      if (path.includes('/commits?')) return [{ sha }];
      if (path.includes('/check-runs?')) return { check_runs: options.active ? [{ name: 'Workers Builds: dodo', app: { slug: 'cloudflare-workers-and-pages' }, status: 'in_progress' }] : [] };
      throw new Error(`Unexpected fixture request ${path}`);
    },
    cloudflare: async (path: string, request: { method?: string } = {}) => {
      const method = request.method ?? 'GET';
      calls.push({ path, method });
      if (method === 'GET' && path.includes('/d1/database?')) return { result: options.databases ?? [database] };
      if (method === 'DELETE' && path === previewPath && options.failPreview) throw new Error('Preview API failed');
      if (method === 'DELETE' && [previewPath, databasePath].includes(path)) return null;
      throw new Error(`Unexpected fixture request ${path}`);
    },
  };
}

test('cleanup rejects production, forks, open PRs, ambiguous database names and invalid IDs', () => {
  assert.equal(cleanupIdentity(pr, source)?.name, identity.name);
  assert.equal(cleanupIdentity({ ...pr, state: 'open' }, source), null);
  assert.equal(cleanupIdentity({ ...pr, head: { ...pr.head, repo: { full_name: 'someone/dodo' } } }, source), null);
  for (const ref of ['main', 'HEAD', '', '--worker-name=production'])
    assert.throws(() => cleanupIdentity({ ...pr, head: { ...pr.head, ref } }, source));
  assert.throws(() => cleanupIdentity(pr, { ...source, name: 'another-worker' }));
  assert.throws(() => cleanupIdentity(pr, { ...source, d1_databases: [] }));
  assert.throws(() => cleanupDatabase([{ ...database, uuid: source.d1_databases[0].database_id }], identity, source));
  assert.throws(() => cleanupDatabase([database, database], identity, source));
  assert.throws(() => cleanupDatabase([{ ...database, uuid: '-'.repeat(36) }], identity, source));
  assert.equal(cleanupDatabase([{ ...database, name: 'dodo' }], identity, source), undefined);
});

test('dry runs do not mutate; applying deletes the exact preview before its validated database', async () => {
  const dry = fixture();
  assert.equal(await cleanupPullRequest(2, dry), 'dry-run');
  assert.equal(dry.calls.some(call => call.method === 'DELETE'), false);
  const apply = fixture();
  assert.equal(await cleanupPullRequest(2, { ...apply, dryRun: false }), 'deleted');
  assert.deepEqual(apply.calls.filter(call => call.method === 'DELETE'), [
    { path: previewPath, method: 'DELETE' }, { path: databasePath, method: 'DELETE' },
  ]);
  assert.ok(!JSON.stringify(apply.calls).includes(source.d1_databases[0].database_id));
});

test('cleanup preserves open, forked, shared, reopened and still-building previews', async () => {
  for (const options of [
    { pull: { ...pr, state: 'open' } },
    { pull: { ...pr, head: { ...pr.head, repo: { full_name: 'someone/dodo' } } } },
    { open: true }, { reopened: true }, { active: true },
  ]) {
    const run = fixture(options);
    assert.ok(['skipped', 'deferred'].includes(await cleanupPullRequest(2, { ...run, dryRun: false })));
    assert.equal(run.calls.some(call => call.method === 'DELETE'), false);
  }
});

test('unexpected preview deletion failures stop database deletion; absent resources are safe to retry', async () => {
  const failed = fixture({ failPreview: true });
  await assert.rejects(cleanupPullRequest(2, { ...failed, dryRun: false }), /Preview API failed/);
  assert.equal(failed.calls.some(call => call.path === databasePath), false);
  const missing = fixture({ databases: [] });
  assert.equal(await cleanupPullRequest(2, { ...missing, dryRun: false }), 'deleted');
  assert.deepEqual(missing.calls.filter(call => call.method === 'DELETE'), [{ path: previewPath, method: 'DELETE' }]);
  const protectedDb = fixture({ databases: [{ ...database, uuid: source.d1_databases[0].database_id }] });
  await assert.rejects(cleanupPullRequest(2, { ...protectedDb, dryRun: false }), /production/);
  assert.equal(protectedDb.calls.some(call => call.method === 'DELETE'), false);
});

test('closing and late build-completion events resolve only the matching Dodo PRs', async () => {
  const repositoryEvent = { repository: { full_name: repository } };
  const github = async (path: string) => path.includes('/check-suites/') ? { head_branch: branch } : [pr];
  assert.deepEqual(await eventPullRequests('pull_request_target', { ...repositoryEvent, action: 'closed', pull_request: pr }, github), [2]);
  assert.deepEqual(await eventPullRequests('workflow_dispatch', { ...repositoryEvent, inputs: { pr_number: '2' } }, github), [2]);
  const event = { ...repositoryEvent, action: 'completed', check_run: { name: 'Workers Builds: dodo', app: { slug: 'cloudflare-workers-and-pages' }, check_suite: { id: 123 } } };
  assert.deepEqual(await eventPullRequests('check_run', event, github), [2]);
  assert.deepEqual(await eventPullRequests('check_run', event, async () => ({ head_branch: 'main' })), []);
  assert.deepEqual(await eventPullRequests('check_run', { ...event, check_run: { ...event.check_run, name: 'Unrelated worker' } }, github), []);
  await assert.rejects(eventPullRequests('workflow_dispatch', { ...repositoryEvent, inputs: { pr_number: '--delete-production' } }, github));
  await assert.rejects(eventPullRequests('pull_request_target', { ...event, repository: { full_name: 'another/repo' } }, github));
});

test('API requests retry transient failures, tolerate only expected missing resources, and never log error bodies', async () => {
  let calls = 0;
  const clients = apiClients({ githubToken: 'github-fixture', cloudflareToken: 'cloudflare-fixture', sleep: async () => {},
    fetcher: async (url: string, init: RequestInit) => {
      assert.ok(url.startsWith('https://api.cloudflare.com/client/v4/'));
      assert.equal(new Headers(init.headers).get('Authorization'), 'Bearer cloudflare-fixture');
      if (++calls === 1) throw new Error('Network error');
      if (calls === 2) return new Response('sensitive provider detail', { status: 503 });
      return new Response('not found', { status: 404 });
    },
  });
  assert.equal(await clients.cloudflare(previewPath, { method: 'DELETE', missing: true }), null);
  assert.equal(calls, 3);
  await assert.rejects(clients.cloudflare(previewPath, { method: 'DELETE' }), error => {
    assert.ok(error instanceof Error && error.message.includes('HTTP 404'));
    assert.ok(!error.message.includes('not found'));
    return true;
  });
  await assert.rejects(clients.cloudflare('https://evil.example/steal-token'));
});
