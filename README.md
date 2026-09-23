# Maitri LSP App

React Native (Expo) source for the Maitri Life Skills Programme app --
Facilitator + Programme Admin, built against `maitri-lsp-full-spec.pdf`.

## What's here

This is a **working front-end** covering every screen in the spec, now wired
to a **real Node.js/Express + PostgreSQL backend** (see `../backend`)
instead of the original AsyncStorage mock.

| Spec section | Status |
|---|---|
| Login, forced password change | **Real** -- phone+password against the backend, bcrypt-hashed, JWT session |
| Attendance: geofence check | **Real** -- uses your actual GPS + haversine distance against the Geo master |
| Attendance: face check | Stubbed -- tap "Verify face" to simulate a pass. Needs a real on-device model (see below) |
| Sessions (PSR) form | **Real** -- saved via the backend API |
| Uploads (photo/PDF/PPT picker) | **Real** -- file bytes are uploaded to the backend and stored on disk (swappable for S3) |
| Content library + Admin publish | **Real** -- same upload path as above |
| Dashboards (facilitator + admin), search, RAG filters, drill-down | Working against live backend data |
| Export to Excel | Stubbed (shows what would be exported) |
| Masters (Resources/Beneficiaries/Categories/Geo): add/edit/delete | Add + delete working against the backend; edit is still a stub alert |
| Import from Excel (all masters incl. Schedule) | Stubbed (file picker works, parsing doesn't) |
| Schedule: two-step recurring builder | **Real** -- generates actual dates from frequency/day/date range (Monthly = every 4 weeks) |
| Attendance Override + audit log | **Real** -- id + timestamp are assigned server-side for a trustworthy audit trail |

Data now lives in Postgres and is shared across every device talking to the
same backend. A session (JWT + user) is cached locally via AsyncStorage so
you're not forced to sign in again every app restart.

`src/data/mockData.js` is no longer used anywhere -- it's left in place only
as a reference for the original seed shapes (the backend's `db/seed.js`
mirrors it) and can be deleted once you're comfortable everything's wired.

## Before running: point it at your backend

Set up and start `../backend` first (see its README), then edit
`src/config.js` and set `API_BASE_URL` to wherever that server is reachable
from your phone/emulator (Android emulator, iOS simulator, and physical
device via Expo Go each need a different value -- `src/config.js` has the
specifics).

## Demo accounts

Same as before, now backed by real (hashed) passwords in Postgres -- seeded
by `../backend/db/seed.js`:

| Phone | Password | Role |
|---|---|---|
| 9840012345 | changeme123 | Facilitator (Divya Shankar) |
| 9840023456 | changeme123 | Facilitator, forces password change on login (Karthik Raman) |
| 9840034567 | changeme123 | Programme Admin (Priya Menon) |

## Running it locally

You'll need Node.js installed, and the backend running (see above). Then,
from this folder:

```bash
npm install
npx expo start
```

This opens Expo's dev tools. Scan the QR code with the **Expo Go** app
(iOS/Android) on your phone to run it instantly without building anything,
or press `a` for an Android emulator / `i` for an iOS simulator if you have
Android Studio / Xcode set up locally.

## Building an actual installable .apk

Two options, since a native Android build can't run inside a plain chat
environment:

### Option A -- EAS Build (recommended, no Android Studio needed)

1. Create a free account at https://expo.dev
2. `npm install -g eas-cli`
3. `eas login`
4. From this project folder: `eas build:configure` (creates `eas.json`)
5. `eas build --platform android --profile preview`

This builds in Expo's cloud and gives you a download link for a real
`.apk` (or `.aab` for Play Store) in a few minutes -- no local Android
toolchain required. Remember `API_BASE_URL` in `src/config.js` needs to be
a real reachable https:// URL for a build like this (not `localhost`).

### Option B -- Local build with Android Studio

1. Install Android Studio + the Android SDK
2. `npx expo prebuild` (generates the native `android/` project)
3. `cd android && ./gradlew assembleRelease`
4. The `.apk` lands in `android/app/build/outputs/apk/release/`

## What still needs work

- On-device face embedding + match (e.g. ML Kit Face Detection +
  a lightweight embedding comparator) wired into
  `src/screens/facilitator/AttendanceScreen.js`'s `verifyFace()`.
- Server-side Excel parsing (`exceljs`/`SheetJS`) with upsert-by-code, for
  every "Import from Excel" stub in the Admin Masters and Schedule screens
  -- see "Not yet done" in `../backend/README.md`.
- Real Excel export endpoint for the two Dashboards' "Export to Excel".
- Role-based authorization on the backend (currently any authenticated user
  can hit any endpoint -- fine for a trusted pilot, not for production).
- Editing an existing Resource (Masters screen) is still a stub.
- S3 (or equivalent) for uploads instead of local disk, once you're past
  single-server hosting.

## Project structure

```
App.js                          -- entry point, providers, NavigationContainer
src/
  config.js                     -- API_BASE_URL for the backend
  theme.js                      -- shared colours/spacing
  context/AuthContext.js        -- phone+password login against the backend, JWT session
  data/api.js                   -- fetch wrapper (auth header, JSON handling)
  data/mockData.js              -- unused; kept as a reference for seed shapes
  data/store.js                 -- DataProvider: CRUD against the backend API
  utils/geofence.js             -- real haversine distance / geofence match
  components/UI.js              -- shared buttons, fields, chips, cards
  navigation/
    RootNavigator.js            -- login gate + top bar + role switch
    FacilitatorTabs.js          -- Attendance / Sessions / Uploads / Dashboard / Content
    AdminTabs.js                -- Masters / Schedule / Override / Content / Dashboard
  screens/
    LoginScreen.js
    facilitator/*.js            -- Screens 1-6 of the Facilitator app
    admin/*.js                  -- Screens 1-5 of the Admin app

../backend/                     -- Node/Express + PostgreSQL API (see its own README)
```

## Note on this build

This client-backend wiring was written and reviewed for correctness but
**not run end-to-end** in the environment that generated it (no outbound
network access there to install npm packages or run a real Postgres/Expo
setup). Test it locally against the backend before relying on it, especially
the file-upload flow (`UploadsScreen.js`, `ContentAdminScreen.js`) which
depends on React Native's `FormData` + `fetch` behaving the way Expo's
runtime implements it.
