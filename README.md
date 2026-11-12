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
- `tests`: validation tests and API integration smoke test.

The first version supports task creation by pressing Enter, inline title editing, completion, deletion with confirmation. Completed tasks remain in the list below incomplete tasks. It starts empty and stores real data in D1.

## Accounts

Email/password accounts use Better Auth on the Worker, with users, hashed passwords, sessions, and auth rate limits in D1. All task queries require a valid session and scope ownership to its user ID. Signing in on another device opens the same task list. Web sessions use HttpOnly cookies; native uses Better Auth's Expo client and SecureStore. Sign-out revokes the current session in D1. Session responses and task data are never cached.

The first sign-in on a previously anonymous installation imports its existing tasks using the old workspace key, then removes that key. Import is atomic and a key can only be claimed by one account; it no longer grants access to task CRUD. Other devices' old anonymous lists are imported when the same account signs in there.

`npm run dev` creates an ignored `apps/api/.dev.vars` with a random development-only `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL=http://localhost:8787`. Keep that secret stable across restarts. `npm run preview` uses the same file; run `node scripts/setup-local-auth.mjs` first on a fresh checkout. Production must have its own secret and canonical public URL; missing configuration fails closed.

Email code login and magic links use Better Auth with Resend. The default sign-in screen sends a six-digit code; users can choose a sign-in link or the existing password flow. Email login creates an account on first use and verifies email ownership. Codes and links expire after five minutes and are stored hashed in D1. Codes allow three attempts; resending rotates the code. Both methods have server-side send/verification rate limits and atomic single-use redemption.

Magic links open `/auth/verify` and require a confirmation click before redemption. A normal page visit or email scanner cannot consume a token. The confirmation request uses a dedicated header and origin checks. Invalid, expired, and already-used links show a recoverable error. The authenticated email is checked against the link's email hint before opening tasks and importing any legacy list. Link pages send `Referrer-Policy: no-referrer`.

On first email ownership verification, Better Auth revokes access created before that verification, including unverified passwords and sessions, while retaining the account and its tasks. A previously unverified password account can continue using email sign-in afterward. Password reset and email-change screens, social login, and account deletion are not implemented. Native email codes use SecureStore through the Expo adapter; native universal/app links still need configuring before a native release.

Production sends from `Dodo <login@dodotasks.xyz>` through Resend using the `RESEND_API_KEY` Worker secret. That key is sending-only and restricted to `dodotasks.xyz`; the domain is verified in Resend. There is no Cloudflare Email Sending binding or Paid-plan requirement. Configure the secret with `npm exec -w @dodo/api -- wrangler secret put RESEND_API_KEY` for another deployment; never put it in `vars` or the frontend.

Local `npm run dev` captures messages in memory at `http://localhost:8787/__dev/mail`; no real email is sent and no production Resend key is needed. The generated `.dev.vars` points `AUTH_EMAIL_DEV_URL` there and uses an unused placeholder key. Only a loopback auth URL can use this capture transport. The endpoint exists only in the local dev proxy, rejects cross-origin access, keeps the latest 50 messages, and clears on restart. `npm run preview` has no capture server; use normal development to test email locally, or explicitly configure delivery for preview.

## PWA

Production web exports include an app manifest, generated 192px/512px icons, and a Workbox service worker. The app shell works offline after an initial online visit. Task data is never cached by the service worker and mutations require a connection; offline sync is not implemented. Install from your browser's app menu (HTTPS required). Localhost caching is disabled for development.

## Checks

```sh
npm run typecheck
npm run lint
npm test
npm run build
# With the app running on port 8787:
node --experimental-strip-types tests/api-smoke.mts
node --experimental-strip-types tests/passwordless-smoke.mts
```

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

Cloudflare builds branches outside `main` with the same checks and posts a Preview URL on their pull requests. Each branch gets a stable Preview URL and its own D1 database, created and migrated by `npm run deploy:preview`. Further pushes reuse that branch's database and update its Preview. Preview deployment refuses `main` and production database IDs. Cloudflare's native Previews deploy under the existing `dodo` Worker; they do not replace its production deployment.

`scripts/deploy-preview.mjs` generates an ignored configuration with the branch database in both its migration and Preview bindings. Names include a hash of the original branch name to distinguish branches whose URL slugs match. The checked-in `previews` block intentionally has no default database, so a bare `wrangler preview` cannot fall back to production D1. Run the script after `npm run build:ci`; Workers Builds provides the branch as `WORKERS_CI_BRANCH`, with the local Git branch used outside CI.

Preview URLs are public, with normal Dodo sign-in still required for tasks. Create an **email/password** account separately on each branch; production users and tasks are not copied. Previews receive an independent `BETTER_AUTH_SECRET` from Cloudflare's Previews Base secrets. They have no Resend credential, so email code and magic-link delivery are unavailable. Never use a production password or real task data in a preview. To rotate the shared preview secret, use `npm exec -w @dodo/api -- wrangler preview base-config secret put BETTER_AUTH_SECRET`; Base secret changes apply to newly created Previews.

D1 databases are account resources: deleting a Preview or closing a PR does not automatically delete its database. Preview databases use the `dodo-preview-<branch-hash>` prefix. Retire them manually with the corresponding Preview when no longer needed; the Free plan's database quota also applies to previews. No paid plan is enabled by this setup.

## Native next steps

The screens already use React Native primitives. Configure `EXPO_PUBLIC_API_URL` with your HTTPS Worker URL, choose iOS/Android application identifiers in app.json, and use Expo development builds. Test on actual native devices before releasing. Platform-specific auth clients, legacy workspace storage, and PWA registration are isolated in `.web.ts` adapters. Native builds have not yet been verified.

## Task completion

A task is complete when `completedAt` is non-null. The API accepts a timezone-qualified ISO timestamp or `null` to reopen it, and returns timestamps normalized to UTC. The checkbox sends the current time when checked. Title-only updates preserve the completion timestamp.

Migration `0003_task_completed_at.sql` preserves existing completion status, using `updated_at` as the approximate completion time for tasks already marked done. Their exact historical completion times were not recorded.

## Due dates

`dueKind` distinguishes `none`, `date`, and `datetime`. `dueAt` is null, a calendar date (`YYYY-MM-DD`), or a UTC ISO timestamp, respectively. Date-only deadlines are never converted to UTC or another timezone, so an all-day deadline cannot be confused with an actual midnight deadline. Timed deadlines also store an IANA `timeZone` for interpreting local selections. Display and editing use the device timezone.

Set or clear the due fields together in an API request; partial changes to `dueAt` alone are rejected. Ordinary title/completion patches preserve the deadline. Task titles always use the same inline input, with a subtle underline on focus and no change in position or padding. Titles save on Enter or when clicking/focusing outside the task. Escape discards the title draft. Date and delete chips appear below the title. Saved deadlines are clickable date chips that open the date modal. New tasks expose their date chip only while editing the draft; clicking outside hides it without losing the draft.

The date modal uses `react-native-calendars` for a calendar on web and native. An unset date starts on today. Time stays optional: tapping Add time fills the current time in the device timezone, and removing it restores a date-only deadline. Timed deadlines open in the device timezone; there is no timezone entry field. Web uses MUI TimeClock with hour/minute selection and AM/PM controls; native uses the system time picker through `@expo/ui`. Save applies the draft, Clear removes the deadline, and Cancel or clicking outside discards changes. Nonexistent spring-forward times are rejected; duplicated fall-back times use the earlier instant.

Recurrence is not implemented.

## Natural-language deadlines

New tasks and edited task titles recognize English dates and times locally with Chrono. Recognized phrases are underlined, preview the deadline chip as you type, and are extracted from the saved title on Enter or an existing task's outside-click save. An input containing only a deadline needs a task title before it can be saved. Removing all phrases restores the previously selected deadline; Escape discards an existing task's draft.

Supported examples include `wed`, `nov 1`, `tomorrow`, `today`, `tm`/`tmr`/`tmrw`, `next week`, `1:00`, `02:00`, `13:00`, `1p`, `1pm`, and `1 o'clock`. Dates without a year move forward to their next occurrence. A bare weekday includes today, and next week means next Monday. The rightmost date and rightmost time win independently, so `today 1pm tomorrow 2pm` resolves to tomorrow at 2pm. All recognized phrases are extracted, including superseded ones.

Time-only phrases use the next occurrence when no date is already selected. An hour without AM/PM or a leading zero can be AM or PM; the next matching time wins (`1 o'clock` at 10am becomes 1pm). Leading-zero and 24-hour forms are explicit (`02:00` is 2am). With a selected date, the date is preserved; a future date's ambiguous hour uses its first matching time. Changing just the date preserves an existing time, and changing just the time preserves an existing date. All conversion uses the device timezone and the same DST validation as the date modal. Choosing a date manually in the modal extracts the recognized phrases and uses the manually selected deadline.
