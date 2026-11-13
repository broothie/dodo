import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { previewIdentity } from './deploy-preview.mjs';

export const repository = 'broothie/dodo';
export const accountId = 'ff9d49775ec143561efdaf9d88089845';
const worker = 'dodo';
const productionDatabaseId = '2c2d038d-db07-43cd-8c3b-8a81f38536de';
const accountPath = `/accounts/${accountId}`;
const repositoryPath = `/repos/${repository}`;

function positiveInteger(value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) throw new Error('Expected a positive PR or check suite number.');
  return number;
}

export function cleanupIdentity(pr, source) {
  if (source.name !== worker || !source.d1_databases?.some(db => db.database_id === productionDatabaseId))
    throw new Error('Refusing cleanup with an unexpected production configuration.');
  if (pr.base?.repo?.full_name !== repository || pr.head?.repo?.full_name !== repository || pr.state !== 'closed')
    return null;
  positiveInteger(pr.number);
  return previewIdentity(pr.head.ref);
}

export function cleanupDatabase(databases, identity, source) {
  const matches = databases.filter(db => db.name === identity.databaseName);
  if (matches.length > 1) throw new Error('Preview database name is ambiguous.');
  const database = matches[0];
  if (database && (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(database.uuid) || database.uuid === productionDatabaseId ||
      source.d1_databases.some(db => db.database_id === database.uuid)))
    throw new Error('Refusing to delete a production or invalid database.');
  return database;
}

export function apiClients({ githubToken, cloudflareToken, fetcher = fetch, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  if (!githubToken || !cloudflareToken) throw new Error('GitHub and preview cleanup credentials are required.');
  async function request(base, token, path, { method = 'GET', missing = false } = {}) {
    if (!path.startsWith('/') || path.startsWith('//')) throw new Error('Expected an API-relative path.');
    for (let attempt = 0; attempt < 3; attempt++) {
      let response;
      try {
        response = await fetcher(`${base}${path}`, {
          method,
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'User-Agent': 'dodo-preview-cleanup' },
          signal: AbortSignal.timeout(30000),
        });
      } catch {
        if (attempt === 2) throw new Error(`${method} ${base}${path} could not connect.`);
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      if (response.status === 404 && missing) { await response.body?.cancel(); return null; }
      if ((response.status === 429 || response.status >= 500) && attempt < 2) {
        await response.body?.cancel();
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`${method} ${base}${path} failed (HTTP ${response.status}).`);
      }
      if (response.status === 204) return null;
      const data = await response.json();
      if (data.success === false) throw new Error(`${method} ${base}${path} was rejected.`);
      return data;
    }
  }
  return {
    github: path => request('https://api.github.com', githubToken, path),
    cloudflare: (path, options) => request('https://api.cloudflare.com/client/v4', cloudflareToken, path, options),
  };
}

async function githubPages(github, path, key) {
  const items = [];
  for (let page = 1; page <= 100; page++) {
    const data = await github(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
    const batch = key ? data[key] : data;
    if (!Array.isArray(batch)) throw new Error('Unexpected GitHub list response.');
    items.push(...batch);
    if (batch.length < 100) return items;
  }
  throw new Error('GitHub pagination exceeded the cleanup limit.');
}

async function hasOpenPullRequest(github, branch) {
  const pulls = await githubPages(github, `${repositoryPath}/pulls?state=open&head=${encodeURIComponent(`broothie:${branch}`)}`);
  return pulls.some(pr => pr.state === 'open' && pr.head?.repo?.full_name === repository && pr.head.ref === branch);
}

async function hasActiveBuild(github, pr) {
  if (pr.commits > 250) throw new Error('PR exceeds GitHub’s commit-list limit; refusing unverified cleanup.');
  const commits = await githubPages(github, `${repositoryPath}/pulls/${pr.number}/commits`);
  for (const sha of new Set([pr.head.sha, ...commits.map(commit => commit.sha)])) {
    if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error('Unexpected PR commit SHA.');
    const checks = await githubPages(github, `${repositoryPath}/commits/${sha}/check-runs?filter=all`, 'check_runs');
    if (checks.some(check => check.app?.slug === 'cloudflare-workers-and-pages' &&
        check.name === 'Workers Builds: dodo' && check.status !== 'completed')) return true;
  }
  return false;
}

export async function cleanupPullRequest(number, { github, cloudflare, source, dryRun = true, log = console.log }) {
  number = positiveInteger(number);
  const prPath = `${repositoryPath}/pulls/${number}`;
  const pr = await github(prPath);
  if (pr.number !== number) throw new Error('PR response does not match the requested number.');
  const identity = cleanupIdentity(pr, source);
  if (!identity) { log(`PR #${number}: not a closed Dodo branch PR; nothing to delete.`); return 'skipped'; }
  if (await hasOpenPullRequest(github, pr.head.ref)) {
    log(`PR #${number}: branch still has an open PR; preserving its preview.`); return 'skipped';
  }
  if (await hasActiveBuild(github, pr)) {
    log(`PR #${number}: preview build is active; cleanup will retry when the build completes.`); return 'deferred';
  }
  const previewPath = `${accountPath}/workers/workers/${worker}/previews/${encodeURIComponent(identity.name)}`;
  // Resolve the exact database by name, then delete by its validated UUID.
  const databases = [];
  for (let page = 1; ; page++) {
    if (page > 100) throw new Error('D1 pagination exceeded the cleanup limit.');
    const data = await cloudflare(`${accountPath}/d1/database?name=${encodeURIComponent(identity.databaseName)}&per_page=50&page=${page}`);
    if (!Array.isArray(data.result)) throw new Error('Unexpected D1 database list response.');
    databases.push(...data.result);
    if (data.result.length < 50) break;
  }
  const database = cleanupDatabase(databases, identity, source);
  // Recheck immediately before mutations in case the PR was reopened while waiting.
  const latest = await github(prPath);
  const latestIdentity = cleanupIdentity(latest, source);
  if (latest.number !== number || latestIdentity?.name !== identity.name || await hasOpenPullRequest(github, pr.head.ref)) {
    log(`PR #${number}: PR state changed; preserving its preview.`); return 'skipped';
  }
  log(`${dryRun ? 'Would delete' : 'Deleting'} preview ${identity.name}${database ? ` and database ${database.name} (${database.uuid})` : '; database already absent'}.`);
  if (dryRun) return 'dry-run';
  // A failed preview deletion must never be followed by database deletion.
  await cloudflare(previewPath, { method: 'DELETE', missing: true });
  if (database) await cloudflare(`${accountPath}/d1/database/${database.uuid}`, { method: 'DELETE', missing: true });
  log(`PR #${number}: preview cleanup complete.`);
  return 'deleted';
}

export async function eventPullRequests(eventName, event, github) {
  if (event.repository?.full_name !== repository) throw new Error('Unexpected workflow repository.');
  if (eventName === 'pull_request_target' && event.action === 'closed')
    return [positiveInteger(event.pull_request.number)];
  if (eventName === 'workflow_dispatch') return [positiveInteger(event.inputs?.pr_number)];
  if (eventName === 'check_run' && event.action === 'completed' &&
      event.check_run?.app?.slug === 'cloudflare-workers-and-pages' && event.check_run.name === 'Workers Builds: dodo') {
    const suite = await github(`${repositoryPath}/check-suites/${positiveInteger(event.check_run.check_suite.id)}`);
    if (!suite.head_branch || suite.head_branch === 'main') return [];
    const pulls = await githubPages(github, `${repositoryPath}/pulls?state=closed&head=${encodeURIComponent(`broothie:${suite.head_branch}`)}`);
    return pulls.filter(pr => pr.head?.repo?.full_name === repository && pr.head.ref === suite.head_branch)
      .map(pr => positiveInteger(pr.number));
  }
  return [];
}

async function main() {
  const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const clients = apiClients({ githubToken: process.env.GITHUB_TOKEN, cloudflareToken: process.env.CLOUDFLARE_PREVIEW_CLEANUP_TOKEN });
  const source = JSON.parse(await readFile(new URL('../apps/api/wrangler.jsonc', import.meta.url), 'utf8'));
  const numbers = await eventPullRequests(process.env.GITHUB_EVENT_NAME, event, clients.github);
  const dryRun = !process.argv.includes('--apply') || (process.env.GITHUB_EVENT_NAME === 'workflow_dispatch' && event.inputs?.dry_run !== 'false' && event.inputs?.dry_run !== false);
  for (const number of [...new Set(numbers)]) await cleanupPullRequest(number, { ...clients, source, dryRun });
  if (!numbers.length) console.log('No matching closed PR previews to clean up.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
