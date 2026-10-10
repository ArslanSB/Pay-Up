# Pay Up native apps: design spec

Date: 2026-10-10
Status: approved design, awaiting spec review

Builds on `2026-10-08-tip-jar-design.md` (the web app). Everything that spec decides still holds unless this one says otherwise.

## 1. Purpose

Bring Pay Up to Android phones and Wear OS watches as native apps, published on Google Play for anyone.

The watch exists to catch yourself faster than unlocking a phone: tap your wrist, or the Tile, and the fine is in. The phone app replaces the website on a phone: it does everything the web does, plus a home-screen widget.

The existing server stays the backend. Its business logic already lives in `app/lib/` as typed functions over SQLite, separate from the web pages. The work adds a second door into that logic, a versioned JSON API with per-device tokens, and the two native apps behind it. The web app is not rewritten.

Success looks like:
- A fine from the watch Tile takes one swipe and one tap, and a fine from the phone widget takes one tap. Neither waits on the network.
- Signing a watch in takes a tap on the watch and a tap on the phone.
- The balance is always honest, offline included: a tap is never lost or counted twice.
- Both apps pass Play review for phones and Wear OS.

Choices made during brainstorming, recorded so they are not reopened by accident:
- Public on Google Play, not sideloaded or friends-only.
- API, Wear OS app and phone app are designed together now, built in that order.
- The phone app has full parity with the web plus a widget. The watch app is tap-focused: no settling, no notes, no jar editing.
- Every native device signs in with a link code (OAuth device authorization grant, RFC 8628) approved where the user is already signed in.
- Each device talks to the server directly. Phone and watch do not sync data with each other.
- The watch keeps the yellow background. The original spec rejected dark mode with "The yellow is the brand", and the hard ink shadows that define the look vanish on black.

## 2. Decisions

| Topic | Decision |
|---|---|
| Backend | The existing React Router server. A new JSON API at `/api/v1` calls the same `app/lib` functions as the web pages. |
| API auth | `Authorization: Bearer pu_…`, one token per device, stored as a SHA-256 hash. API routes never read the session cookie. |
| Device sign-in | Link codes: the device gets a secret device code and a short user code; the user approves the short code on the web or in the phone app; the device polls and receives its token once. |
| Android code | One Gradle project in `android/`: `core` (library), `wear` (app), `mobile` (app). Kotlin, Jetpack Compose. |
| Package | `com.arslansb.payup` for both apps, one Play listing. |
| Server URL | `https://payup.arslansb.com` in release builds. |
| Watch UI | Compose for Wear OS (Material 3 components, restyled), a Tile built with ProtoLayout. |
| Phone UI | Compose, restyled to match the web. A Glance home-screen widget. |
| Local data | Room for the jar cache and the offline queue, DataStore for small settings and the encrypted token, WorkManager for sync. |
| Networking | Ktor client (OkHttp engine) with kotlinx.serialization. |
| SDK levels | Target and compile API 36 for both apps. Minimum API 28 on phones, API 30 (Wear OS 3) on watches. |

## 3. Scope

In:
- Server: the `/api/v1` API, devices and link codes, the `/link` and `/link/phone` approval pages, a `/devices` page on the web, sign-in that returns to the page it started from, `/.well-known/assetlinks.json`, a public `/delete-account` page, and an "Apps" section in the privacy policy.
- Shared Android core: API client, token storage, jar cache, offline queue and sync, link flow, money and date formatting.
- Wear OS app: sign in, jar list, jar screen with pay and undo, settings (Tile jar, sign out), and a Tile that adds a fine without opening the app.
- Phone app: everything the web does (sign in, jars dashboard, jar page with notes, undo, settle and share, create, edit and delete jars with the live link check, devices, sign out, delete account), approving a watch's link code, and a home-screen widget.
- Play Store listing, Data safety answers, and the closed test.

Out, recorded so nobody builds them by accident:
- Watch complications, settling or notes on the watch.
- Phone-to-watch data sync over the Wearable Data Layer.
- iOS and watchOS.
- Push notifications, Quick Settings tile, launcher shortcuts.
- Rewriting the web app as a client of the API.
- Analytics, crash reporting SDKs, ads.
- Offline creation, editing, settling or deletion on the phone. Only adding and undoing fines work offline.

## 4. Architecture

```
                 app/lib  (jars, fines, settle, users, devices, links)
                /                                   \
   web routes (SSR, cookie session)          /api/v1 routes (JSON, bearer token)
                                                  |                 |
                                               wear app         mobile app
                                                  \_ android/core _/
```

Repository layout after the work:

```
pay-up/
  app/                       web app and backend (unchanged structure)
    lib/
      api.server.ts          JSON responses, errors, body parsing, requireDevice
      devices.server.ts      tokens, devices: create, find by token, list, revoke
      links.server.ts        link codes: start, poll, approve, cancel, purge
      rate-limit.server.ts   in-memory fixed-window limiter
    routes/
      api.v1.*.ts            API resource routes (section 5.4)
      link.tsx               /link        approval page
      link.phone.tsx         /link/phone  approval page for the phone's own sign-in
      devices.tsx            /devices     list and revoke devices
      delete-account.tsx     /delete-account  public explanation for Play
      assetlinks.ts          /.well-known/assetlinks.json
  android/
    settings.gradle.kts, build.gradle.kts, gradle/libs.versions.toml, version.properties
    core/                    Android library
    wear/                    Wear OS app
    mobile/                  phone app
  design/wear.html           clickable round-screen mockup of the watch app
```

## 5. Server

### 5.1 Data model

One new migration appended to `MIGRATIONS` in `db.server.ts`:

```
devices
  id            TEXT PK                  -- 16-char id, as elsewhere
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE
  kind          TEXT NOT NULL            -- 'phone' | 'watch'
  name          TEXT NOT NULL            -- 1..60 chars, sent by the device ("Pixel Watch 3")
  token_hash    TEXT NOT NULL UNIQUE     -- hex SHA-256 of the bearer token
  created_at    TEXT NOT NULL
  last_used_at  TEXT NOT NULL
  INDEX (user_id)

device_links
  id                TEXT PK
  device_code_hash  TEXT NOT NULL UNIQUE -- hex SHA-256 of the device code
  user_code         TEXT NOT NULL UNIQUE -- 8 chars, stored without the dash
  kind              TEXT NOT NULL        -- 'phone' | 'watch'
  name              TEXT NOT NULL        -- 1..60 chars
  approved_by       TEXT REFERENCES users(id) ON DELETE CASCADE  -- null until approved
  created_at        TEXT NOT NULL
  expires_at        TEXT NOT NULL        -- created_at + 10 minutes
  last_polled_at    TEXT

fines
  + client_id   TEXT                     -- nullable; set by native clients
  UNIQUE INDEX (jar_id, client_id) WHERE client_id IS NOT NULL
```

Secrets:
- Bearer token: `pu_` followed by 32 random bytes in base64url. The prefix lets secret scanners recognize a leaked token.
- Device code: 32 random bytes in base64url.
- User code: 8 characters from `BCDFGHJKLMNPQRSTVWXZ` (no vowels, so no accidental words, and no look-alike characters), shown as `WDJB-MJHT`. Input is normalized: uppercased, dash and spaces removed.
- Only hashes of the token and the device code are stored. The user code is stored as is; it is short-lived and only useful to someone already signed in.

Invariants:
- A link issues at most one token. Issuing it deletes the link row, so a second poll gets `410`.
- Expired links are deleted whenever a new link is started.
- Deleting a user deletes their devices and the links they approved. Unapproved links belong to nobody and expire.
- `last_used_at` is written only when the stored value is more than an hour old.
- Replaying a fine with a `client_id` already present in that jar returns the existing fine and inserts nothing.

### 5.2 Linking

1. The device calls `POST /api/v1/links` with `{ kind, name }` and gets `{ deviceCode, userCode, verificationUrl, verificationUrlComplete, expiresAt, interval }`.
   - `verificationUrl` is `https://payup.arslansb.com/link`.
   - `verificationUrlComplete` is `…/link?code=WDJB-MJHT` for a watch and `…/link/phone?code=WDJB-MJHT` for a phone. The phone app opens its own sign-in on a different path so that its App Link (section 6.4) never captures it.
   - `interval` is 5 seconds.
2. The user approves the code, in one of three places:
   - **`/link` or `/link/phone` in a browser.** Without a session, the page shows the same sign-in buttons as the landing page and returns to itself after sign-in. With `provider=google` or `provider=github` in the query, `/link/phone` starts that provider immediately. With a session, it shows "Link *{name}* to your Pay Up account?", the code for comparison, and two buttons: "Link watch" (or "Link phone") and "Cancel". Without a code in the URL it shows a code field.
   - **In the phone app**, when the watch opens `/link?code=…` on a phone that has the app installed (section 6.4).
   - After approval the watch page shows "Linked. Your watch is ready." The phone page shows "Signed in. Return to Pay Up." with a button that opens `payup://linked`, a custom scheme that carries no secret and only brings the app to the front.
   - "Cancel" deletes the link; the device then gets `410`.
   - An unknown or expired code shows "That code has expired. Start again on your device."
3. The device polls `POST /api/v1/links/token` with `{ deviceCode }` every `interval` seconds.
   - `202` with `{ status: "pending" }` while waiting.
   - `200` with `{ token, device, user }` once approved. The server creates the `devices` row in the same transaction that deletes the link.
   - `410` with code `expired` when the link expired, was cancelled, or already issued its token.
   - `429` with code `slow_down` when polled more than a second sooner than `interval` after the previous poll (the second allows for network jitter).

Sign-in returning to where it started: `/auth/:provider` accepts `returnTo`, a same-origin path that starts with `/` and not `//`. It is stored in the existing ten-minute OAuth cookie, and the callback redirects there instead of `/jars`. Anything else falls back to `/jars`.

### 5.3 API conventions

- Base path `/api/v1`. JSON request and response bodies. Request bodies over 16 KB are rejected with `400`.
- Every endpoint requires `Authorization: Bearer pu_…`, except `POST /links` and `POST /links/token`. `requireDevice(request, db)` hashes the token, loads the device and its user, and throws `401` when either is missing.
- Money is integer minor units plus an ISO 4217 code. Timestamps are ISO 8601 UTC. Responses carry no formatted labels; the apps format in the device's locale and timezone, as the web does for the browser's.
- Every response has `Cache-Control: no-store`. There are no CORS headers: only native apps call the API.
- Errors are `{ "error": { "code": string, "message": string, "fields"?: { [field]: string } } }`:

| Status | Code | When |
|---|---|---|
| 400 | `invalid_request` | Malformed JSON, body too large, wrong types |
| 400 | `validation` | Field rules failed; `fields` has one message per field |
| 401 | `unauthorized` | Missing, unknown or revoked token |
| 404 | `not_found` | Unknown resource, or a jar, fine or device belonging to someone else |
| 405 | `method_not_allowed` | With an `Allow` header |
| 409 | `slug_taken` | `fields.publicSlug` is "That link is taken." |
| 409 | `already_settled` | "That fine is already settled." |
| 409 | `nothing_to_settle` | "Nothing to settle yet." |
| 410 | `expired` | Link code expired, cancelled or used |
| 429 | `slow_down` | Link polled too fast |
| 429 | `rate_limited` | Too many links started from one IP |
| 500 | `server_error` | Anything unexpected; details only in the server log |

- Validation reuses the web's rules and messages. `validation.ts` gains `parseJarJson(body)`, which shares the zod field rules with `parseJarForm`. The one difference is the amount: JSON sends `fineAmount` as integer minor units, checked as an integer greater than 0 with the web's message "Amount must be more than 0." Field names in `fields` are the JSON names (`title`, `description`, `fineAmount`, `currency`, `visibility`, `publicSlug`).
- Notes: optional, trimmed, at most 140 characters, empty means none, as `parseNote`.
- `POST /links` is limited to 10 per IP per 10 minutes. The IP is Express's `req.ip` (which honours `TRUST_PROXY`), passed to React Router in an `x-payup-client-ip` header that `server.js` sets on every request, overwriting any value the client sent. Under `react-router dev`, which does not use `server.js`, every request shares one bucket.
- Compatibility: `/api/v1` only ever gains endpoints and fields. Nothing is removed or renamed. A breaking change would be a new `/api/v2` alongside v1. Clients ignore unknown fields.

### 5.4 Endpoints

Shapes:
```
User       { id, name, email, avatarUrl, provider }
Device     { id, kind, name, createdAt, lastUsedAt, current }
Jar        { id, title, description, fineAmount, currency, visibility, publicSlug, publicUrl,
             unsettledTotal, unsettledCount, createdAt, updatedAt }
Fine       { id, amount, note, createdAt }
Settlement { id, total, note, fineCount, createdAt }
Balance    { total, count }
JarInput   { title, description?, fineAmount, currency, visibility, publicSlug? }
```

On `PUT /jars/:id`, an absent `publicSlug` keeps the jar's current link; `null` or an empty string derives a fresh one from the title, as the web form's empty field does.

| Method and path | Request | Response |
|---|---|---|
| `POST /links` | `{ kind, name }` | `201` link (section 5.2) |
| `POST /links/token` | `{ deviceCode }` | `202`, `200 { token, device, user }`, `410`, `429` |
| `GET /links/:userCode` | | `200 { kind, name, expiresAt }`, `404` if unknown or expired |
| `POST /links/:userCode/approve` | | `204` |
| `DELETE /links/:userCode` | | `204` (cancel) |
| `GET /me` | | `200 { user }` |
| `DELETE /me` | | `204`; deletes the account and everything in it |
| `GET /devices` | | `200 { devices }`, newest first; `current` marks the caller |
| `DELETE /devices/:id` | | `204`; `current` as the id signs the caller out |
| `GET /jars` | | `200 { jars }`, ordered as the web dashboard (newest first) so tile colors match |
| `POST /jars` | `JarInput` | `201 { jar }`, `400`, `409 slug_taken` |
| `GET /jars/:id` | | `200 { jar, unsettled: Fine[], settlements: Settlement[] }`, newest first |
| `PUT /jars/:id` | `JarInput` | `200 { jar }`, `400`, `409 slug_taken` |
| `DELETE /jars/:id` | | `204` |
| `GET /slugs/:slug?jar=` | | `200 { slug, valid, available }`, as `/api/slug` |
| `POST /jars/:id/fines` | `{ note?, clientId?, createdAt? }` | `201 { fine, balance }`; a replayed `clientId` gives `200` with the original fine |
| `DELETE /jars/:id/fines/:fineId` | | `200 { balance }`, `409 already_settled`, `404` |
| `POST /jars/:id/settlements` | `{ note? }` | `201 { settlement, balance }`, `409 nothing_to_settle` |

Fine details:
- `clientId`: 1 to 64 characters of letters, digits and dashes. Clients send a random UUID per tap.
- `createdAt`: used when it is not in the future and at most 7 days old; otherwise the server's time is used. Offline taps keep their real time this way.
- The amount is always the jar's `fine_amount` when the server receives the fine.
- A new `addClientFine` beside `addFine` takes `{ note, clientId, createdAt }` and returns the fine and whether it created the row. `addFine` and its web callers are unchanged.

Implementation: each endpoint group is a React Router resource route (`app/routes/api.v1.*.ts`): the loader handles GET, the action dispatches on `request.method`. The first task of the server plan confirms that React Router accepts POST, PUT and DELETE requests without an `Origin` header. If it does not, the same handlers are mounted in `server.js` as Express routes under `/api/v1`, before the React Router handler, and nothing else in this spec changes.

### 5.5 Web changes

- `/link` and `/link/phone`: section 5.2. Same Loud styling as the rest of the web.
- `/devices` (owner): each device with its kind, name, created date and last-used date, and "Revoke" behind a confirmation ("Revoke *{name}*? It will be signed out."). Linked from the dashboard next to "Sign out". With no devices: "No phones or watches yet. Get Pay Up on Google Play."
- `/delete-account` (anyone): what deleting removes (account, jars, fines, settlements, devices), a "Sign in to delete" button that signs in with `returnTo=/jars` where the existing delete control lives, and the operator's contact email. This URL goes into the Play Data safety form.
- `/privacy`: a new "Apps" section. It says that each device stores its token, cached jars and fines not yet synced; that the device sends its name and kind; that devices can be revoked from `/devices` or the phone app; and that the apps contain no analytics, ads or tracking SDKs.
- `/.well-known/assetlinks.json`: a resource route, since `express.static` ignores dot-folders. It lists `com.arslansb.payup` with the SHA-256 fingerprints from a new `ANDROID_CERT_FINGERPRINTS` variable (comma-separated). When the variable is empty the route returns 404 and App Links stay unverified.

New configuration:

| Variable | Required | Default |
|---|---|---|
| `ANDROID_CERT_FINGERPRINTS` | for App Links | empty. The debug certificate's fingerprint during development; the Play App Signing fingerprint for release. |

## 6. Android

### 6.1 Project

- One Gradle project in `android/` with a version catalog. Modules `core` (Android library), `wear` and `mobile` (apps).
- Kotlin and Jetpack Compose. No dependency-injection framework: each app has a small hand-written `AppContainer`.
- `compileSdk` and `targetSdk` 36. `minSdk` 28 for `core` and `mobile`, 30 for `wear`. No native code.
- `version.properties` holds one `versionName` for both apps, starting at `1.0.0`. `versionCode = 10 * (major * 10000 + minor * 100 + patch)` for the phone; the watch adds 1, so the two bundles in one listing never collide.
- Build types:
  - `release`: API base URL `https://payup.arslansb.com`, minified, cleartext traffic disallowed.
  - `debug`: base URL from the Gradle property `payup.apiBaseUrl` (default `https://payup.arslansb.com`), cleartext allowed by a debug-only network security config so a local dev server works.
- Signing: Play App Signing. The upload keystore lives outside the repo with a backup; its path and passwords are read from `~/.gradle/gradle.properties`.
- Each app has a baseline profile, generated on the emulator, to speed up startup.
- Toolchain on this Mac (none installed today): Android Studio stable with its bundled JDK, the Android SDK for API 36, a Wear OS emulator image and a phone emulator image.

### 6.2 Core

- **API client.** One suspend function per endpoint. Results are sealed: `Success(value)`, `Unauthorized`, `NotFound`, `Conflict(code, message)`, `Invalid(fields)`, `Offline`, `ServerError`.
- **Token store.** The token is encrypted with an AES-GCM key held in the Android Keystore and stored in DataStore. App data is excluded from backup and device transfer, so a restored device signs in again.
- **Device name.** `Settings.Global.DEVICE_NAME`, falling back to `Build.MODEL`, trimmed to 60 characters.
- **Room database:**
  - `jars`: the last `GET /jars` result plus the time it was fetched.
  - `jar_details`: the last `GET /jars/:id` result per jar (phone only uses it).
  - `pending_ops`: an ordered queue of `AddFine(jarId, clientId, note, createdAt)` and `DeleteFine(jarId, fineId)`.
- **Displayed balance** = cached `unsettledTotal` + pending `AddFine` count for that jar × the jar's `fineAmount`. When the queue is not empty the UI shows "{n} waiting to sync".
- **Sync** runs as unique WorkManager work with a network constraint and exponential backoff. It is enqueued after every queued operation, when the app starts, and when a Tile or widget becomes visible with a non-empty queue. Operations are sent in order:

| Result | Action |
|---|---|
| Success, or `200` for a replayed `clientId` | Remove the operation, update the cached jar |
| `Offline`, `5xx`, `429` | Stop, retry later with backoff |
| `404` (jar or fine gone) | Drop the operation, show "1 fine couldn't sync: that jar was deleted." |
| `400`, `409` | Drop the operation, show the server's message |
| `401` | Stop, clear all local data, return to sign-in with "This device was signed out." |

- **Undo** of a fine still in the queue removes its `AddFine`. Undo of a synced fine queues a `DeleteFine`.
- **Refresh.** `GET /jars` runs when an app opens, and when a Tile or widget becomes visible and the cache is older than 5 minutes. There is no background polling.
- **LinkFlow.** Starts a link, polls at the server's interval (stretching it when told `slow_down`), stops at `expiresAt`, and can be cancelled. Both apps use it.
- **Sign-out.** Waits up to 10 seconds for the queue to sync. If operations remain, the app asks "{n} fines haven't synced and will be lost." before continuing. It then calls `DELETE /devices/current` (best effort), and clears the token, Room and DataStore, and refreshes Tiles and widgets.
- **Formatting.** Money with `android.icu.text.NumberFormat` currency formatting in the device locale, which matches the web's `Intl` output. Dates with `java.time` in the device timezone. Day grouping ("Today", "Yesterday", "6 October") is a port of `app/lib/dates.ts` with the same test cases.
- **Copy** is English, in each app's string resources, with the web's vocabulary.

### 6.3 Wear OS app

Declared standalone (`com.google.android.wearable.standalone` true), so it works without the phone app. Round layouts, swipe-to-dismiss, crown scrolling. No ambient mode: the app returns to the watch face.

Screens:
1. **Sign in.**
   - The app icon and wordmark, and a "Sign in on phone" button.
   - The button starts a link and opens `verificationUrlComplete` on the paired phone with `RemoteActivityHelper`.
   - While waiting: "Check your phone", the code on two lines (`WDJB` / `MJHT`), and `payup.arslansb.com/link`, so the code can be typed elsewhere if the phone is out of reach.
   - On expiry it offers to start again.
2. **Jars.**
   - A scaling list: the subtitle as on the web dashboard ("21,00 € owed. Ouch.", "Nothing owed.", or the jar count when currencies are mixed), then one chip per jar with its title and "12,50 € owed".
   - Chips cycle pink, blue (white text), mint and white, in the web dashboard's order.
   - Settings chips at the end.
   - Empty: "No jars yet. Make one on your phone."
3. **Jar.**
   - The title, a large round pink "Pay 1 €" button, the white "you owe 12,50 €" sticker overlapping its lower right, rotated −4°.
   - A tap: confirm haptic, the button sinks into its shadow, a "+1 €" pop rises and fades over 600 ms, the balance updates in the same frame.
   - After a tap, an "Undo" pill appears at the bottom. The screen keeps the fines tapped during this visit; each Undo removes the newest, with a light tick haptic, and the pill disappears when none are left.
   - Rapid taps each count, and pops stack.
   - The crown does nothing on this screen, so turning it cannot add a fine.
4. **Settings.**
   - "Tile jar": pick the jar the Tile uses. The default is the first jar in the list.
   - "Sign out" (section 6.2).

Start screen: with exactly one jar, that jar; otherwise the jar used last, or the list when no jar has been used yet or the last one was deleted. Swipe back from a jar shows the list.

Tile:
- Full-bleed yellow, built on the ProtoLayout Material 3 primary layout so spacing matches system Tiles.
- Content: the Tile jar's title, the pink pay circle with its hard shadow (an ink circle offset behind it), and "you owe 12,50 €".
- Tapping the circle is a load action: `onTileRequest` sees the click, queues an `AddFine`, enqueues sync, and returns the new layout with the updated balance. The app does not open.
- For 60 seconds after a Tile tap, an "Undo" button appears at the bottom, below the balance. It undoes the Tile's most recent fine.
- Tapping the title opens the app on that jar.
- `onTileRequest` reads only Room and DataStore, never the network.
- Sync completion and every change in the app call `TileService.getUpdater(…).requestUpdate`.
- Signed out: "Sign in", which opens the app. No jars: "Make a jar on your phone".

### 6.4 Phone app

Screens follow the web routes, with the web's layout and copy:
1. **Sign in.**
   - Icon, wordmark, the README tagline, "Continue with Google" and "Continue with GitHub", and the web's consent line with Privacy Policy and Terms of Service links.
   - Each button starts a link and opens `verificationUrlComplete&provider=…` in a Custom Tab.
   - The app polls in the background and finishes when it is next in front (the `payup://linked` button brings it there).
2. **Jars.** The "Jars" title, the dashboard subtitle, tiles in two columns with the first full width, colors cycling, the dashed "+ New jar" tile, and the web's empty state. The avatar opens a menu: Devices, Account, Privacy Policy, Terms of Service.
3. **Jar.**
   - Title, the tilted description strip, the note field, Pay with the sticker and pop, grouped history with Undo and Delete, the settle form with note, "Edit jar", and "Share link" (the Android share sheet) or "Private".
   - Opens from the cached detail, then refreshes. Pull to refresh.
4. **New and Edit jar.**
   - The web's fields and messages. The amount uses the decimal keypad.
   - The public link check calls `GET /slugs/:slug` 300 ms after typing stops and cancels the previous request.
   - "Delete jar" behind a confirmation.
   - Input survives rotation and process death.
5. **Devices.** As the web's `/devices`, with "This phone" on the current device.
6. **Account.** "Sign out", and "Delete account" behind the web's confirmation, which calls `DELETE /me`.
7. **Link a watch.**
   - An App Link (`autoVerify`) on `https://payup.arslansb.com/link` exactly, so the watch's link opens here when the app is installed.
   - "Link *Pixel Watch 3* to your Pay Up account?", "Link watch" and "Cancel", then "Linked. Your watch is ready."
   - If the phone app is signed out, it signs in first, then shows the approval.

Offline: adding and undoing fines go through the queue. Every other change needs the network and, when offline, shows "You're offline. Try again when you're connected." without losing the user's input.

Widget (Glance):
- One widget per jar, picked in a configuration screen when it is added.
- 2×1: the pay button and balance. 3×2 and larger: adds the title and the sticker.
- Yellow with a 3 dp ink border, the pink pay button with its hard shadow (layered boxes), the white sticker.
- Pay runs an action callback that queues an `AddFine`, enqueues sync, and updates the widget. The app does not open.
- For 60 seconds after a widget tap, "Undo" appears, as on the Tile.
- Tapping the title opens the jar. A deleted jar shows "This jar was deleted." and opens the configuration screen on tap.

On screens 600 dp and wider the content column is at most 720 dp and centered, as on the web. Orientation is not locked.

## 7. Visual design

Both apps carry the web's "Loud" direction (original spec, section 8). The frontend-design review made three corrections to the first watch proposal: yellow instead of black (the brand, and the shadows), the web's bordered blocks and color cycle instead of stock Material chips, and the condensed width of Bricolage Grotesque instead of truncated titles.

Tokens, unchanged from the web:
```
yellow #FFD83D   background everywhere, Tile and widget included
pink   #FF5DA2   pay
blue   #2F5BFF   one tile color (white text)
mint   #9FE7C2   one tile color, settled rows
white  #FFFFFF   sticker, secondary surfaces
ink    #000000   text, borders, hard shadows
```

Type: Bricolage Grotesque only, bundled from the Google Fonts variable file (OFL), which carries the weight, width and optical size axes. Titles are weight 800; on the watch, Tile and widget they also use the narrowest width (75) so names fit. Amounts use tabular figures. Labels are weight 600. Display text uses line height 0.92 and letter spacing −0.03em, as on the web.

| | Watch and Tile | Phone and widget |
|---|---|---|
| Border | 2 dp | 3 dp |
| Hard shadow | 4 dp on pay, 3 dp elsewhere | 8 dp on pay, 6 dp elsewhere |
| Press | sinks 3 dp into the shadow, 70 ms | sinks 4 dp (5 dp on pay), 70 ms |
| Pay label | 30 sp | 44 sp |
| Titles | 18 sp | 56 sp dashboard, 46 sp jar |
| Body and labels | 13 to 15 sp | 16 sp |
| Minimum touch target | 48 dp | 48 dp |

Rules carried over from the web:
- The pay button is the loudest thing on any screen it appears on. Passive blocks have a border and no shadow.
- Everything on the watch is centered and stays inside the round safe area.
- With Android's "Remove animations" setting on, there is no pop and no sinking press; the pressed state is a color change only.
- No ripple anywhere; pressing sinks the block instead.
- Screen readers hear the pay button and sticker as one control: "Pay 1 euro. You owe 12 euros 50."
- Layouts are checked at the largest font size; titles may wrap to two lines.

Watch jar screen:
```
┌────────────── round · yellow ──────────────┐
│                   10:42                     │  system clock
│                Negativity                   │  800 condensed
│              ▄███████████▄                  │
│            ███   Pay 1 €   ███▒             │  pink circle, ink ring,
│            ███             ███▒             │  4 dp hard shadow
│              ▀███████████▀ ┌──────────┐     │
│                ▒▒▒▒▒▒▒▒▒▒▒ │ you owe  │     │  white sticker, −4°
│                            │ 12,50 €  │     │
│                            └──────────┘     │
│                 [ Undo ]                    │  ink pill, after a tap
└─────────────────────────────────────────────┘
```

Watch jar list:
```
│               10:42                │
│       21,00 € owed. Ouch.          │
│  ┌──────────────────────────────┐  │
│  │ Negativity                   │▌ │  pink
│  │ 12,50 € owed                 │▌ │
│  └──────────────────────────────┘  │
│  ┌──────────────────────────────┐  │
│  │ Swearing                     │▌ │  blue, white text
│  │ 8,50 € owed                  │▌ │
│  └──────────────────────────────┘  │
│   Tile jar: Negativity   Sign out  │  white chips
```

Phone widget, 3×2:
```
┌──────────────────────────────┐  yellow, 3 dp ink border
│ Negativity                   │  800 condensed
│ ┌───────────────┐ ┌────────┐ │
│ │   Pay 1 €     │▌│you owe │ │  pink + hard shadow; white sticker
│ └───────────────┘▌│12,50 € │ │
│   ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀ └────────┘ │
└──────────────────────────────┘
```

Before the watch app is built, `design/wear.html` shows the four watch screens and the Tile in round frames with the real tokens, clickable, for review. It sits next to the existing mockups and is not shipped.

## 8. Copy

New strings, in the web's voice:
- Watch: "Sign in on phone", "Check your phone", "No jars yet. Make one on your phone.", "Tile jar", "Sign out", "Undo".
- Tile: "Sign in", "Make a jar on your phone".
- Both apps: "{n} waiting to sync", "1 fine couldn't sync: that jar was deleted.", "This device was signed out.", "{n} fines haven't synced and will be lost.", "You're offline. Try again when you're connected."
- Link pages and phone approval: "Link {name} to your Pay Up account?", "Link watch", "Link phone", "Cancel", "Linked. Your watch is ready.", "Signed in. Return to Pay Up.", "That code has expired. Start again on your device."
- Devices: "This phone", "Revoke", "Revoke {name}? It will be signed out.", "No phones or watches yet. Get Pay Up on Google Play."
- Widget: "This jar was deleted."

Everything else reuses the web's existing copy ("Pay 1 €", "you owe", "Settle 12,50 €", "Edit jar", "Share link", "Nothing in the jar yet.", form messages).

## 9. Testing

Server (Vitest, in-memory database, as today):
- `devices.server.ts`: token lookup by hash, unknown and revoked tokens, `last_used_at` written at most hourly, cascade on user deletion.
- `links.server.ts`: start, pending, approve, one-time token, second poll `410`, cancel, expiry, `slow_down`, purge of expired links, user code normalization.
- API routes, called directly with a `Request`: `401` without or with a revoked token; `404` for another user's jar, fine and device; validation messages identical to the web forms; `slug_taken`; `clientId` replay returns the original fine; `createdAt` accepted inside the 7-day window and replaced outside it; `already_settled`; `nothing_to_settle`; `DELETE /me` cascades; body over 16 KB rejected; `POST /links` rate limit.
- `returnTo`: same-origin paths kept; `//evil.example`, absolute URLs and junk fall back to `/jars`.
- `/link` pages: signed-out shows sign-in with `returnTo`; approve; cancel; expired code message.
- `assetlinks.json`: fingerprints listed; 404 when unset.

Android (JVM unit tests, Robolectric where Android classes are involved):
- Core: API client against Ktor's mock engine (every error mapping); queue and sync rules against an in-memory Room database (replay, 404 drop, 409 drop, 401 sign-out, offline undo, ordering); token store round trip; formatting and day grouping with the web's cases, including the two-timezone day boundary.
- Wear: Compose UI tests for each screen; the Tile rendered with its test tooling and fed a click, including the 60-second Undo.
- Mobile: Compose UI tests for each screen; ViewModel tests for the jar form (messages, debounced link check, delete confirmation); a Glance widget test.

Manual checklist on the real watch and phone:
- Watch sign-in with the phone app installed (one tap in the app) and without it (browser).
- Phone sign-in with Google and with GitHub.
- Watch taps in airplane mode, then reconnect: balance correct, no duplicates.
- Tile tap and Tile Undo; widget tap and widget Undo, both offline too.
- Revoke the watch from the web: it returns to sign-in with "This device was signed out."
- Delete the account from the phone app.
- TalkBack on both apps; largest font size; 200% display size on the phone.

## 10. Google Play

- One listing, `com.arslansb.payup`, with a phone bundle and a Wear OS bundle.
- Requirements checked on 2026-10-10:
  - Since 31 August 2026, new apps and updates must target API 36 (phones) and API 35 (Wear OS). Both apps target 36.
  - From 15 September 2026, Wear OS apps must support 64-bit devices. Neither app has native code, so this holds.
  - Apps that create accounts must offer deletion in the app (Account screen) and on the web (`/delete-account`).
- Personal developer accounts created after 13 November 2023 must run a closed test with at least 12 opted-in testers for 14 consecutive days before production unlocks; if the count drops below 12 the 14 days restart. This spec assumes that case. An organization account, or an older personal one, skips it. The closed test starts as soon as the watch app is usable, so the 14 days run while the phone app is built.
- Data safety: collects name, email and account ID (account management) and jar titles, fines and notes (app functionality); encrypted in transit; not shared; deletion available at `https://payup.arslansb.com/delete-account`.
- Store assets: the existing 512 px icon, a 1024×500 feature graphic, phone screenshots, round Wear OS screenshots including the Tile. The description reuses the landing page copy.
- Once the app exists in Play Console, the Play App Signing certificate's SHA-256 fingerprint goes into `ANDROID_CERT_FINGERPRINTS` on the server.

## 11. Rollout

Three implementation plans, each shippable on its own:
1. **Server.** Sections 5.1 to 5.5. Deploys alone; web users only notice the Devices page.
2. **Toolchain, mockup, core and watch.** Install the toolchain, build `design/wear.html` for review, then `core` and `wear`. Test on the real watch, create the Play listing, start the closed test.
3. **Phone app and widget.** `mobile`, joining the closed test, then production for both.

## 12. Later, if wanted

Watch complications, settling and voice notes on the watch, phone-to-watch sync over the Data Layer, Quick Settings tile, launcher shortcuts, iOS. Each is a separate brainstorm.
