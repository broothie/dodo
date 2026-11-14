# Dodo

A task app. Expo + React Native + Tamagui + TypeScript on the frontend, with a Cloudflare Worker and D1 database behind it.

## Run locally

Use Node 24 (`nvm use`) and npm.

```sh
npm install
npm run dev
```

Open http://localhost:8787. One command starts Expo/Metro with Fast Refresh, the Workers API, and a local development proxy. Frontend saves appear automatically; Wrangler reloads API changes. The proxy sends `Cache-Control: no-store`, and localhost never registers a PWA service worker. Any older localhost PWA worker is retired automatically. Local D1 data and the development session secret are preserved across restarts.

Tasks persist in `apps/api/.wrangler/state`; no Cloudflare account is needed locally. The frontend and API share port 8787, with Metro on 8081 and Wrangler on 8788 behind the proxy. Stop all three with Ctrl+C.

To inspect the production web export separately, stop development and run `npm run preview`. This builds and serves the static frontend on port 8787; edits require another build. Offline PWA caching is enabled on deployed hosts, not localhost.

For native development, use `npm run dev:app` and set `EXPO_PUBLIC_API_URL` to your computer's LAN address and API port. Set local `BETTER_AUTH_URL` to that same API origin in `apps/api/.dev.vars`; it is also the trusted origin for auth. Localhost on a phone refers to the phone itself. Use a development build for SDK 58 native testing.

## Layout

- `apps/app`: Tamagui controls and theme configuration, with Expo Router screens using React Native components, shared across web, iOS, and Android.
- `apps/api`: Workers API, generated Cloudflare binding types, D1 migrations, and static frontend hosting.
- `packages/shared`: task model, request validation, and a fetch-based API client.
- `apps/app/src/components`: task screen layout, task rows/composer, shared controls, auth, and settings. Platform-specific controls use `.web.tsx` siblings.
- `apps/app/src/hooks/use-task-controller.ts`: task loading/mutations, editing drafts, Undo, and keyboard focus coordination.
- `apps/app/src/lib`: non-visual task edit decisions, grouping, keyboard guards, RxDB storage/replication, and platform integrations.
- `tests`: unit tests and API integration smoke tests; `tests/e2e` contains Playwright browser regressions.

The app supports task creation by pressing Enter, inline title editing, completion, and immediate deletion with Undo. Tasks are grouped by date, with completed tasks below incomplete tasks. It starts empty and stores real data in D1.

## Accounts

The task page’s three-dot button opens Settings, with account details, sign-out, and Device / Light / Dark appearance options. Appearance defaults to Device, follows live system changes, and is saved on the current device (browser storage on web, SecureStore on native).

Passwordless accounts use Better Auth on the Worker, with users, sessions, and auth rate limits in D1. Enter an email and verify a code; the first successful verification creates the account, with no name or password form. Password registration, login, and password-management endpoints are disabled. Existing accounts and task ownership remain intact; use the same email to sign in. All task queries require a valid session and scope ownership to its user ID. Signing in on another device opens the same task list. Web sessions use HttpOnly cookies; native uses Better Auth's Expo client and SecureStore. Sign-out revokes the current session in D1. Session responses and task data are never cached.

The first sign-in on a previously anonymous installation imports its existing tasks using the old workspace key, then removes that key. Import is atomic and a key can only be claimed by one account; it no longer grants access to task CRUD. Other devices' old anonymous lists are imported when the same account signs in there.

`npm run dev` creates an ignored `apps/api/.dev.vars` with a random development-only `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL=http://localhost:8787`. Keep that secret stable across restarts. `npm run preview` uses the same file; run `node scripts/setup-local-auth.mjs` first on a fresh checkout. Production must have its own secret and canonical public URL; missing configuration fails closed.

Email code login uses Better Auth with Resend. The sign-in screen sends a six-digit code. Email login creates an account on first use and verifies email ownership. Codes expire after five minutes and are stored hashed in D1. Codes allow three attempts; resending rotates the code. Server-side send/verification rate limits and atomic single-use redemption are enforced. Magic-link sending and verification endpoints are disabled.

On first email ownership verification, Better Auth revokes access created before that verification, including unverified passwords and sessions, while retaining the account and its tasks. A previously unverified password account can continue using email sign-in afterward. Email-change screens, social login, and account deletion are not implemented. Native email codes use SecureStore through the Expo adapter.

Production sends from `Dodo <login@dodotasks.xyz>` through Resend using the `RESEND_API_KEY` Worker secret. That key is sending-only and restricted to `dodotasks.xyz`; the domain is verified in Resend. There is no Cloudflare Email Sending binding or Paid-plan requirement. Configure the secret with `npm exec -w @dodo/api -- wrangler secret put RESEND_API_KEY` for another deployment; never put it in `vars` or the frontend.

Local `npm run dev` captures messages in memory at `http://localhost:8787/__dev/mail`; no real email is sent and no production Resend key is needed. The generated `.dev.vars` points `AUTH_EMAIL_DEV_URL` there and uses an unused placeholder key. Only a loopback auth URL can use this capture transport. The endpoint exists only in the local dev proxy, rejects cross-origin access, keeps the latest 50 messages, and clears on restart. `npm run preview` has no capture server; use normal development to test email locally, or explicitly configure delivery for preview.

## PWA

Production web exports include an app manifest, generated 192px/512px icons, and a Workbox service worker. The app shell works offline after an initial online visit. Task API responses are never cached by the service worker; tasks are persisted separately in an account-scoped RxDB database. Install from your browser's app menu (HTTPS required). Localhost app-shell caching is disabled for development.

## Offline tasks and replication

The PWA uses RxDB 17 with the free Dexie/IndexedDB adapter. Create, edit, complete, delete, and Undo save locally before returning to the UI, including offline. RxDB's replication metadata retains pending writes across reloads. The Worker remains the authenticated gateway to D1; `/api/sync/pull` returns documents and a sequence checkpoint, while `/api/sync/push` applies client-generated IDs/revisions using atomic compare-and-swap writes. Repeating a completed write is safe. Responses contain no account ownership fields.

D1 migration `0007_task_replication.sql` backfills revisions and adds a monotonic change sequence. Triggers track legacy REST writes, workspace imports, deletion, and Undo independently of task timestamps. Deleted documents remain in the sync feed as tombstones. The original CRUD endpoints remain compatible. Apply local migrations with `npm run db:migrate`; deployment applies remote migrations through the existing deployment script.

Separate field edits merge; due kind/date/timezone are one field group. Concurrent changes to the same group keep the server version. Deletions win conflicts, so stale offline edits cannot resurrect deleted tasks. An explicit Undo restores a task using its latest local revision. There is no history UI for discarded conflicting values, and tombstones are not purged.

One browser tab leads replication; other tabs share local data. Sync continues while Settings is open, polls every ten seconds, and retries on reconnect or visibility changes. It requires the app to remain open; closed-app background uploads are not implemented. The UI indicates offline storage, active sync, or a paused sync. Requests include an account ID assertion checked against the authenticated session, preventing an old tab from replaying data under a different account's cookies.

A previously signed-in account can reopen its local task database offline. Only account display information is remembered locally, not session cookies or tokens. Signing in initially and renewing an expired session require a connection. Sign-out clears the active-account marker and stops that account's sync; its database and unsent changes remain on the device for the next sign-in to the same account. Browser storage clearing/eviction removes unsynced local data.

Native screens use the same `TaskStore` interface with the existing online API adapter. Durable native RxDB storage is not enabled: RxDB's Expo/SQLite storage plugins require a separate licensing/adapter choice. No paid or trial plugin is included.

## Checks

```sh
npm run typecheck
npm run lint
npm test
npm run test:coverage
npm run build
# One-time browser setup:
npm exec -- playwright install chromium
# Builds the app, then runs desktop and mobile Chromium checks:
npm run test:e2e
# Reuse an already current build:
npm run test:e2e:built
# With the app running on port 8787:
node --experimental-strip-types tests/api-smoke.mts
node --experimental-strip-types tests/passwordless-smoke.mts
```

Playwright starts a separate loopback server on port 8790 with a real local Worker, fresh D1 migrations in a temporary directory, test-only auth secrets, and captured emails. Each test uses its own account. It does not use your development database, credentials, or Resend. Temporary databases and mail are discarded when the server stops. Ports 8790 and 8792 must be free; normal development on 8787 can stay running. Tests cover Enter/focus, deadline inheritance and extraction, autosave, deletion/Undo, due-dialog cancellation/clearing, server outages, anonymous-session revalidation, appearance persistence, and sign-out. Offline tests additionally exercise the production service worker, offline reloads, reconnect, two-client conflicts, account isolation, and tab leadership handoff. Other browser tests block service workers.

The `Checks` GitHub Actions workflow runs typechecking (including browser tests), lint, unit tests, the production web build, and Playwright on pull requests and pushes to main. These are separate from Cloudflare's deployment checks. `test:coverage` reports V8 coverage for modules exercised by unit tests; its percentage is not whole-app coverage. Native devices, Safari, and long-running upgrade/storage-eviction behavior still require separate coverage.

## Cloudflare deployment

```sh
npm exec -w @dodo/api -- wrangler login
npm exec -w @dodo/api -- wrangler d1 create dodo
```

The existing `DB` binding in `apps/api/wrangler.jsonc` already points to the created `dodo` database. For another account, replace its `database_id` with the returned ID.

`vars.BETTER_AUTH_URL` is set to `https://dodotasks.xyz`, matching the Worker custom domain in `routes`. Cloudflare manages DNS and the HTTPS certificate for that domain; the original `workers.dev` endpoint remains available as a migration fallback. `BETTER_AUTH_ADDITIONAL_ORIGINS` explicitly allows that origin for authentication; local development ignores production fallback origins. If the app moves again, update both the domain route and auth URL. Web and API must share that origin. Configure a separate random production secret of at least 32 characters using the interactive prompt below; do not commit the secret. `wrangler secret put` changes the deployed Worker, so do this as part of the deployment operation.

```sh
npm exec -w @dodo/api -- wrangler secret put BETTER_AUTH_SECRET
```

Apply all migrations, including `0005_accounts.sql`, and deploy:

```sh
npm exec -w @dodo/api -- wrangler d1 migrations apply dodo --remote
npm run deploy
```

Web and API share a single origin. `/api/*` always runs through the Worker; other requests use static assets. No cloud resources are created by local development.

### Automatic deployments

Cloudflare Workers Builds is connected to `broothie/dodo` and the existing `dodo` Worker with these settings:

| Setting | Value |
| --- | --- |
| Production branch | `main` |
| Root directory | Repository root (`/`) |
| Build command | `npm run build:ci` |
| Deploy command | `npm run deploy:ci` |
| Preview command | `npm run deploy:preview` |
| Non-production branch builds | Enabled |

Cloudflare installs npm dependencies from the lockfile and reads Node 24 from `.nvmrc`. Each push to `main` runs typechecking, lint, unit tests, and the web/PWA build. Only after those succeed does deployment apply pending **production** D1 migrations and publish the Worker and assets to `https://dodotasks.xyz`. A failed check or migration stops deployment. Keep migrations compatible with the currently deployed Worker, since migrations run before the new code goes live.

The `Dodo production builds` token is restricted to Workers Scripts edit, D1 edit, and Account Settings read for this account; Workers Routes edit and Zone read for `dodotasks.xyz`; and User Details/Memberships read for identity discovery. Cloudflare stores the build credential. Runtime secrets (`BETTER_AUTH_SECRET` and `RESEND_API_KEY`) stay on the existing Worker; they are not build variables or frontend configuration. Build history and retries are available in the [Worker's Deployments tab](https://dash.cloudflare.com/ff9d49775ec143561efdaf9d88089845/workers/services/view/dodo/production/deployments), and Cloudflare reports build status on GitHub commits.

`npm run build:ci` can also validate a build locally without deploying. `npm run deploy:ci` is a production operation and assumes the frontend has already been built.

### Pull request previews

Cloudflare builds branches outside `main` with the same checks and reports deployment status on their pull requests. Open the Cloudflare check's build details to find the live Preview URL; the native PR comment currently links build logs rather than the live app. Each branch gets a stable Preview URL and its own D1 database, created and migrated by `npm run deploy:preview`. Further pushes reuse that branch's database and update its Preview. Preview deployment refuses `main` and production database IDs. Cloudflare's native Previews deploy under the existing `dodo` Worker; they do not replace its production deployment.

`scripts/deploy-preview.mjs` generates an ignored configuration with the branch database in both its migration and Preview bindings. Names include a hash of the original branch name to distinguish branches whose URL slugs match. The checked-in `previews` block intentionally has no default database, so a bare `wrangler preview` cannot fall back to production D1. Run the script after `npm run build:ci`; Workers Builds provides the branch as `WORKERS_CI_BRANCH`, with the local Git branch used outside CI.

Preview URLs are public, with normal Dodo sign-in still required for tasks. Production users and tasks are not copied; verify your email separately on each branch to create a preview account. Previews receive an independent `BETTER_AUTH_SECRET` and a separate sending-only `RESEND_API_KEY` restricted to `dodotasks.xyz` from Cloudflare's Previews Base secrets. Login codes are sent as `Dodo Preview <login@dodotasks.xyz>`; the production sending key is not shared. Both secrets are required by the preview deployment script. Use `npm exec -w @dodo/api -- wrangler preview base-config secret put SECRET_NAME` to set or rotate a preview secret. Base secret changes apply only to newly created Previews; update an existing Preview with `npm exec -w @dodo/api -- wrangler preview secret put SECRET_NAME --name PREVIEW_NAME`.

The `Clean up PR preview` GitHub Actions workflow removes a closed or merged PR's Preview and its `dodo-preview-<branch-hash>` D1 database. It runs trusted code from `main`, skips forks and branches still used by an open PR, and validates the database UUID against production before deleting anything. If a Cloudflare build is still active according to its latest check result, cleanup defers until a matching build-completion event retries it. Superseded checks do not block cleanup. Missing resources are safe to retry; a failed Preview deletion stops database deletion. The next deployment after cleanup creates a fresh preview database from migrations.

Cleanup requires the repository secret `CLOUDFLARE_PREVIEW_CLEANUP_TOKEN`, with Worker Editor access restricted to `dodo` and D1 Write for this Cloudflare account. It does not use the production build credential, DNS permissions, or email-sending key. The workflow's GitHub token only reads repository metadata and check status. To clean up an older closed PR or retry a failed cleanup, run `Clean up PR preview` manually with its PR number; the manual workflow defaults to a dry run. Check the named resources in that run's logs before running with `dry_run=false`. D1's database quota also applies to previews.

## Branding

`apps/app/assets/logo-v1.png` is the selected v1 artwork. The shared `Brand` and `Logo` components use it in the app, sign-in, loading, and settings headers. `npm run assets:brand -w @dodo/app` regenerates the wordmark image, favicon, Apple touch icon, PWA icons, and native launcher icons from that source; the web build runs it automatically. Maskable icons include extra padding. Sign-in emails load `/logo-v1.png` from the current app's origin. Generated sizes are checked in so local development has the same branding without a production build.

## Native next steps

The screens already use React Native primitives. Configure `EXPO_PUBLIC_API_URL` with your HTTPS Worker URL, choose iOS/Android application identifiers in app.json, and use Expo development builds. Test on actual native devices before releasing. Platform-specific auth clients, legacy workspace storage, and PWA registration are isolated in `.web.ts` adapters. Native builds have not yet been verified.

## TODO

- [x] Remove delete confirmation step and add Undo.
- [ ] Set up notifications.
- [ ] Set up platform syncing.
- [ ] Add animations.

## Empty tasks

Backspace on an already empty or whitespace-only existing title deletes the task immediately and focuses a neighbouring task when possible. Leaving an existing task empty also deletes it. Removing the last character alone does not delete the task; it takes another Backspace or leaving the task. An empty unsaved row simply closes, and Escape still discards an existing edit. Failed deletes leave the task available to retry.

## Deletion and Undo

All delete controls act immediately. A Tamagui toast offers Undo for eight seconds, including keyboard and empty-task deletions. `deletedAt` is nullable task metadata backed by `deleted_at` in D1: DELETE sets it, active lists exclude it, and ordinary edits cannot change deleted tasks. The owner-scoped `POST /api/tasks/:id/restore` clears it while preserving the task's ID, timestamps, deadline, and completion state. Delete and restore are safe to retry. Undo failures offer Retry, and account-scoped toasts clear when accounts change. Deleted rows are retained; automatic purging and a trash view are not implemented.

## Task completion

A task is complete when `completedAt` is non-null. The API accepts a timezone-qualified ISO timestamp or `null` to reopen it, and returns timestamps normalized to UTC. The checkbox sends the current time when checked. Title-only updates preserve the completion timestamp.

Migration `0003_task_completed_at.sql` preserves existing completion status, using `updated_at` as the approximate completion time for tasks already marked done. Their exact historical completion times were not recorded.

## Due dates

`dueKind` distinguishes `none`, `date`, and `datetime`. `dueAt` is null, a calendar date (`YYYY-MM-DD`), or a UTC ISO timestamp, respectively. Date-only deadlines are never converted to UTC or another timezone, so an all-day deadline cannot be confused with an actual midnight deadline. Timed deadlines also store an IANA `timeZone` for interpreting local selections. Display and editing use the device timezone.

Set or clear the due fields together in an API request; partial changes to `dueAt` alone are rejected. Ordinary title/completion patches preserve the deadline. Task titles always use the same borderless inline input. Clicking or focusing outside a task saves its title. Enter saves the existing task and opens a focused new row immediately below it, inheriting its deadline (or none); submitting that row continues entry below the newly created task. A failed save leaves the current edit open. Escape discards an existing task's title draft. The floating create button opens a new-task row at the top; clicking outside or pressing Escape hides it while preserving the draft. Tasks are grouped by date, with time-only chips; the chip component's `showDate` prop restores full date labels. Date and delete controls appear while editing.

The date modal uses `react-native-calendars` for a calendar on web and native. An unset date starts on today. Time stays optional: tapping Add time fills the current time in the device timezone, and removing it restores a date-only deadline. Timed deadlines open in the device timezone; there is no timezone entry field. Web uses MUI TimeClock with hour/minute selection and AM/PM controls; native uses the system time picker through `@expo/ui`. Save applies the draft, Clear removes the deadline, and Cancel or clicking outside discards changes. Nonexistent spring-forward times are rejected; duplicated fall-back times use the earlier instant.

Recurrence is not implemented.

## Natural-language deadlines

New tasks and edited task titles recognize English dates and times locally with Chrono. Recognized phrases are underlined, preview the deadline chip as you type, and are extracted from the saved title on Enter or an existing task's outside-click save. An input containing only a deadline needs a task title before it can be saved. Removing all phrases restores the previously selected deadline; Escape discards an existing task's draft.

Supported examples include `wed`, `nov 1`, `tomorrow`, `today`, `tm`/`tmr`/`tmrw`, `next week`, `1:00`, `02:00`, `13:00`, `1p`, `1pm`, and `1 o'clock`. Dates without a year move forward to their next occurrence. A bare weekday includes today, and next week means next Monday. The rightmost date and rightmost time win independently, so `today 1pm tomorrow 2pm` resolves to tomorrow at 2pm. Only the winning, underlined expressions are extracted; earlier dates and times remain literal in the saved title and during unrelated edits.

Time-only phrases use the next occurrence when no date is already selected. An hour without AM/PM or a leading zero can be AM or PM; the next matching time wins (`1 o'clock` at 10am becomes 1pm). Leading-zero and 24-hour forms are explicit (`02:00` is 2am). With a selected date, the date is preserved; a future date's ambiguous hour uses its first matching time. Changing just the date preserves an existing time, and changing just the time preserves an existing date. All conversion uses the device timezone and the same DST validation as the date modal. Choosing a date manually in the modal extracts the recognized phrases and uses the manually selected deadline.
