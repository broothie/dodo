import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const apiDirectory = resolve(root, 'apps/api');
const wrangler = resolve(root, 'node_modules/wrangler/bin/wrangler.js');

export function previewIdentity(branch) {
  if (!branch || ['main', 'HEAD'].includes(branch) || branch.startsWith('-'))
    throw new Error('Preview deployment requires a non-production branch.');
  const hash = createHash('sha256').update(branch).digest('hex').slice(0, 12);
  const slug = branch.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'branch';
  return { name: `${slug}-${hash}`, databaseName: `dodo-preview-${hash}` };
}

export function previewConfig(source, branch, database) {
  const identity = previewIdentity(branch);
  if (source.name !== 'dodo' || !source.previews || database.name !== identity.databaseName ||
      !/^[a-f0-9-]{36}$/.test(database.uuid) ||
      source.d1_databases.some((production) => production.database_id === database.uuid))
    throw new Error('Refusing to use an unexpected Worker or production database for a Preview.');
  const binding = { binding: 'DB', database_name: database.name, database_id: database.uuid,
    migrations_dir: resolve(apiDirectory, 'migrations') };
  const vars = { ...source.previews.vars,
    BETTER_AUTH_URL: `https://${identity.name}-dodo.adbooth.workers.dev` };
  return {
    name: source.name,
    account_id: 'ff9d49775ec143561efdaf9d88089845',
    main: resolve(apiDirectory, source.main),
    compatibility_date: source.compatibility_date,
    compatibility_flags: source.compatibility_flags,
    assets: { ...source.assets, directory: resolve(apiDirectory, source.assets.directory) },
    // Even top-level migrations in this generated file can only target the Preview DB.
    d1_databases: [binding],
    vars,
    secrets: { required: ['BETTER_AUTH_SECRET'] },
    previews: { ...source.previews, vars, d1_databases: [binding] },
  };
}

function run(args, capture = false) {
  return execFileSync(process.execPath, [wrangler, ...args], {
    cwd: apiDirectory,
    env: { ...process.env, CI: 'true', CLOUDFLARE_ACCOUNT_ID: 'ff9d49775ec143561efdaf9d88089845' },
    stdio: capture ? ['ignore', 'pipe', 'inherit'] : ['ignore', 'inherit', 'inherit'],
    encoding: 'utf8',
  });
}

async function deploy() {
  const branch = process.env.WORKERS_CI_BRANCH || execFileSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8' }).trim();
  const identity = previewIdentity(branch);
  const source = JSON.parse(await readFile(resolve(apiDirectory, 'wrangler.jsonc'), 'utf8'));
  const listDatabases = () => JSON.parse(run(['d1', 'list', '--json'], true));
  let database = listDatabases().find((candidate) => candidate.name === identity.databaseName);
  if (!database) {
    run(['d1', 'create', identity.databaseName, '--update-config=false']);
    database = listDatabases().find((candidate) => candidate.name === identity.databaseName);
  }
  if (!database) throw new Error('Preview database creation did not return a database.');
  const config = previewConfig(source, branch, database);
  const configPath = resolve(apiDirectory, '.wrangler', `preview-${identity.name}.json`);
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, JSON.stringify(config), { mode: 0o600 });
  try {
    console.log(`Preview ${identity.name}: isolated database ${identity.databaseName}`);
    run(['d1', 'migrations', 'apply', 'DB', '--remote', '--config', configPath]);
    run(['preview', '--name', identity.name, '--config', configPath]);
  } finally {
    await rm(configPath, { force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  deploy().catch(() => {
    console.error('Preview deployment failed. See the Wrangler output above; production was not deployed.');
    process.exitCode = 1;
  });
}
