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

Email verification, password-reset email, social login, and account deletion are not implemented yet. Sign-up currently allows unverified email addresses. There is no outbound email service configured.

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
```

## Cloudflare deployment

```sh
npm exec -w @dodo/api -- wrangler login
npm exec -w @dodo/api -- wrangler d1 create dodo
```

The existing `DB` binding in `apps/api/wrangler.jsonc` already points to the created `dodo` database. For another account, replace its `database_id` with the returned ID.

`vars.BETTER_AUTH_URL` is set to `https://dodo.adbooth.workers.dev`. If the app moves to a custom domain, update it to the new exact HTTPS origin. Web and API must share that origin. Configure a separate random production secret of at least 32 characters using the interactive prompt below; do not commit the secret. `wrangler secret put` changes the deployed Worker, so do this as part of the deployment operation.

```sh
npm exec -w @dodo/api -- wrangler secret put BETTER_AUTH_SECRET
```

Apply all migrations, including `0005_accounts.sql`, and deploy:

```sh
npm exec -w @dodo/api -- wrangler d1 migrations apply dodo --remote
npm run deploy
```

Web and API share a single origin. `/api/*` always runs through the Worker; other requests use static assets. No cloud resources are created by local development. Deployment and remote migrations are explicit operations.

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
