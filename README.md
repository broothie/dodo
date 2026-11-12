# Dodo

A task app. Expo + React Native + Tamagui + TypeScript on the frontend, with a Cloudflare Worker and D1 database behind it.

## Run locally

Use Node 24 (`nvm use`) and npm.

```sh
npm install
npm run dev
```

Open http://localhost:8787. One command starts Expo/Metro with Fast Refresh, the Workers API, and a local development proxy. Frontend saves appear automatically; Wrangler reloads API changes. The proxy sends `Cache-Control: no-store`, and localhost never registers a PWA service worker. Any older localhost PWA worker is retired automatically. Your browser workspace key and local D1 data are preserved.

Tasks persist in `apps/api/.wrangler/state`; no Cloudflare account is needed locally. The frontend and API share port 8787, with Metro on 8081 and Wrangler on 8788 behind the proxy. Stop all three with Ctrl+C.

To inspect the production web export separately, stop development and run `npm run preview`. This builds and serves the static frontend on port 8787; edits require another build. Offline PWA caching is enabled on deployed hosts, not localhost.

For native development, use `npm run dev:app` and set `EXPO_PUBLIC_API_URL` to your computer's LAN address and API port. Localhost on a phone refers to the phone itself. Use a development build for SDK 58 native testing.

## Layout

- `apps/app`: Tamagui controls and theme configuration, with Expo Router screens using React Native components, shared across web, iOS, and Android.
- `apps/api`: Workers API, generated Cloudflare binding types, D1 migrations, and static frontend hosting.
- `packages/shared`: task model, request validation, and a fetch-based API client.
- `tests`: validation tests and API integration smoke test.

The first version supports task creation by pressing Enter, inline title editing, completion, deletion with confirmation. Completed tasks remain in the list below incomplete tasks. It starts empty and stores real data in D1.

Each installation creates a random workspace bearer key. On web it lives in localStorage; native uses Expo SecureStore. The API stores only its SHA-256 hash and scopes every SQL query to it. This is anonymous, device-local identity: clearing browser storage loses access, and other devices have separate task lists. Account sign-in, workspace recovery, sharing, rate limits, and cross-device sync remain future work. Keep the workspace key private.

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

Copy the returned `database_id` into the existing D1 binding in `apps/api/wrangler.jsonc`, then:

```sh
npm exec -w @dodo/api -- wrangler d1 migrations apply dodo --remote
npm run deploy
```

Web and API share a single origin. `/api/*` always runs through the Worker; other requests use static assets. No cloud resources are created by local development. Deployment and remote migrations are explicit operations.

## Native next steps

The screens already use React Native primitives. Configure `EXPO_PUBLIC_API_URL` with your HTTPS Worker URL, choose iOS/Android application identifiers in app.json, and use Expo development builds. Test on actual native devices before releasing. Platform-specific workspace storage and PWA registration are isolated in `.web.ts` adapters. Native builds have not yet been verified.

## Task completion

A task is complete when `completedAt` is non-null. The API accepts a timezone-qualified ISO timestamp or `null` to reopen it, and returns timestamps normalized to UTC. The checkbox sends the current time when checked. Title-only updates preserve the completion timestamp.

Migration `0003_task_completed_at.sql` preserves existing completion status, using `updated_at` as the approximate completion time for tasks already marked done. Their exact historical completion times were not recorded.

## Due dates

`dueKind` distinguishes `none`, `date`, and `datetime`. `dueAt` is null, a calendar date (`YYYY-MM-DD`), or a UTC ISO timestamp, respectively. Date-only deadlines are never converted to UTC or another timezone, so an all-day deadline cannot be confused with an actual midnight deadline. Timed deadlines also store an IANA `timeZone` for display and editing.

Set or clear the due fields together in an API request; partial changes to `dueAt` alone are rejected. Ordinary title/completion patches preserve the deadline. Task titles always use the same inline input, with a subtle underline on focus and no change in position or padding. Titles save on Enter or when clicking/focusing outside the task. Escape discards the title draft. Date and delete chips appear below the title. Saved deadlines are clickable date chips that open the date modal. New tasks expose their date chip only while editing the draft; clicking outside hides it without losing the draft.

The date modal uses `react-native-calendars` for a calendar on web and native. An unset date starts on today. Time stays optional: tapping Add time fills the current time in the device timezone, and removing it restores a date-only deadline. Timed deadlines open in the device timezone; there is no timezone entry field. Web uses MUI TimeClock with hour/minute selection and AM/PM controls; native uses the system time picker through `@expo/ui`. Save applies the draft, Clear removes the deadline, and Cancel or clicking outside discards changes. Nonexistent spring-forward times are rejected; duplicated fall-back times use the earlier instant.

Recurrence is not implemented.
