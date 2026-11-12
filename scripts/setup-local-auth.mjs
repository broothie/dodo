import { randomBytes } from 'node:crypto';
import { chmod, readFile, writeFile } from 'node:fs/promises';

// Keep a stable local secret across restarts, without committing or printing it.
const path = new URL('../apps/api/.dev.vars', import.meta.url);
let existing = '';
try { existing = await readFile(path, 'utf8'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const missing = [];
if (!/^BETTER_AUTH_SECRET\s*=/m.test(existing))
  missing.push(`BETTER_AUTH_SECRET=${randomBytes(48).toString('base64url')}`);
if (!/^BETTER_AUTH_URL\s*=/m.test(existing))
  missing.push('BETTER_AUTH_URL=http://localhost:8787');
if (!/^AUTH_EMAIL_DEV_URL\s*=/m.test(existing))
  missing.push('AUTH_EMAIL_DEV_URL=http://localhost:8787/__dev/mail');
if (!/^RESEND_API_KEY\s*=/m.test(existing))
  missing.push('RESEND_API_KEY=local-dev-placeholder');
if (missing.length) {
  await writeFile(path, `${existing}\n${missing.join('\n')}\n`, { mode: 0o600 });
  await chmod(path, 0o600);
  console.log('Configured local authentication in apps/api/.dev.vars.');
}
