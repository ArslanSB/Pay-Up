# Pay Up: design spec

Renamed from "Tip Jar" on 2026-10-08, after the build: a tip rewards, a fine punishes, and this app collects fines. The unit word is "fine" everywhere, including the schema. The repo folder is still `tip-jar`.

Date: 2026-10-08
Status: approved design, awaiting spec review

## 1. Purpose

A web app where a person creates "jars" for habits they want to catch themselves doing (being negative, swearing, interrupting). Each jar has a fixed fine amount. Whenever the owner catches themselves, they tap once and the jar's balance grows. Periodically they settle the balance however they like (pay a partner, donate, put it in a holiday fund) and the app records the settle-up.

The first user is the author, who wants a negativity jar. The app is multi-user so friends can make their own.

Success looks like: the owner can add a fine from their phone in under two seconds, the balance is always honest, settling is one action with a note, and a public link shows a read-only jar to anyone.

Deliberate choice made during brainstorming: shared links are **view only**. Visitors cannot add fines. The accountability comes from the visible balance, not from witnesses adding entries. This was raised as a weakness and the owner chose it knowingly; it can be revisited later.

## 2. Decisions

| Topic | Decision |
|---|---|
| What a fine is | A tally entry in the jar's currency. No payments. Settle-up marks entries as paid. |
| Sharing | Public jars have a read-only link at `/j/:slug`. The slug is derived from the title, customisable by the owner, and checked for availability as they type. Private jars return 404 on that link. |
| Accounts | Google and GitHub OAuth. No passwords, no email login. |
| Framework | React Router 8 framework mode (SSR, loaders and actions), TypeScript. |
| Data | SQLite via better-sqlite3, inline migrations at boot. |
| Hosting | Single Node process, Docker image, SQLite file on a volume. |
| Visual direction | "Loud" (mockup C): yellow, hot pink pay button, hard black shadows, Bricolage Grotesque. |

## 3. Scope

In v1:
- Sign in with Google or GitHub, sign out.
- Create, edit, delete jars: title, description, fine amount, currency, visibility.
- Dashboard of the signed-in user's jars with unsettled balance and fine count.
- Owner jar page: add a fine with an optional note, delete a fine, settle up with an optional note.
- Public read-only jar page at a shareable slug link, with preview meta tags. The owner can change the slug; the old link then stops working.
- Dockerfile and compose file.
- Favicon and app icons, web manifest, robots.txt.
- Terms of use and Privacy and cookies pages at `/terms` and `/privacy`, naming the operator from `OPERATOR_NAME` and `CONTACT_EMAIL`; footer links on every page; consent line under the sign-in buttons. No cookie banner: the three cookies are essential or functional and nothing needs consent.
- Account deletion from the dashboard (`POST /account`, intent `delete`, behind a confirmation), cascading to jars, fines and settlements, then sign-out to `/?deleted=1`.

Out of v1, recorded so nobody builds them by accident:
- Payments of any kind.
- Visitors adding fines.
- Custom amount or multiplier per tap (every tap adds the jar's configured amount).
- Stats, streaks, charts, reminders, email.
- Data export (the privacy page says to email for it).
- Dark mode. The yellow is the brand.

## 4. Data model

SQLite. All money is an integer in minor units (cents). Timestamps are ISO 8601 UTC strings, always. Ids are random URL-safe strings of 16 characters and never appear in public links. The public link uses a separate slug: 3 to 40 lowercase letters, digits and single dashes, derived from the title (accents stripped) unless the owner types their own. Slugs are global, so a derived slug that is already taken gets a 4-character random suffix (`doom-jar-k7x2`); an explicitly chosen slug that is taken is a form error.

```
users
  id            TEXT PK
  provider      TEXT NOT NULL            -- 'google' | 'github'
  provider_id   TEXT NOT NULL
  email         TEXT                     -- nullable, GitHub may hide it
  name          TEXT NOT NULL
  avatar_url    TEXT
  created_at    TEXT NOT NULL
  UNIQUE (provider, provider_id)

jars
  id            TEXT PK
  owner_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE
  public_slug   TEXT NOT NULL UNIQUE     -- 8 chars, the shareable link
  title         TEXT NOT NULL            -- 1..60 chars
  description   TEXT NOT NULL DEFAULT '' -- 0..280 chars
  fine_amount    INTEGER NOT NULL         -- minor units, > 0
  currency      TEXT NOT NULL            -- ISO 4217, from an allowed list
  visibility    TEXT NOT NULL            -- 'private' | 'public'
  created_at    TEXT NOT NULL
  updated_at    TEXT NOT NULL
  INDEX (owner_id)

fines
  id            TEXT PK
  jar_id        TEXT NOT NULL REFERENCES jars(id) ON DELETE CASCADE
  amount        INTEGER NOT NULL         -- snapshot of jar.fine_amount at tap time
  note          TEXT                     -- nullable, 0..140 chars
  settlement_id TEXT REFERENCES settlements(id) ON DELETE SET NULL
  created_at    TEXT NOT NULL
  INDEX (jar_id, created_at)

settlements
  id            TEXT PK
  jar_id        TEXT NOT NULL REFERENCES jars(id) ON DELETE CASCADE
  total         INTEGER NOT NULL         -- sum of the fines it covered
  note          TEXT                     -- nullable, 0..140 chars
  created_at    TEXT NOT NULL
  INDEX (jar_id, created_at)
```

Invariants:
- Unsettled balance of a jar = sum of `fines.amount` where `settlement_id IS NULL`.
- Settling runs in one transaction: insert the settlement with the current unsettled total, then stamp every unsettled fine with its id. Settling with a zero balance is rejected.
- Editing `fine_amount` never changes existing fines.
- Changing the public link frees the old slug, which then returns 404 like any unknown slug. Toggling visibility never changes the slug. Leaving the link field empty derives a fresh slug from the title.
- Deleting a fine that is already settled is not allowed (the settlement total would lie).
- Accounts are matched only on `(provider, provider_id)`. Two providers with the same email are two users.
- Foreign keys are enforced (`PRAGMA foreign_keys = ON`) and WAL mode is set at boot.

## 5. Routes and pages

Mobile-first. Content column max 720px, centered on wider screens.

| Route | Who | What |
|---|---|---|
| `/` | anyone | Landing: pitch, "Continue with Google", "Continue with GitHub". Signed-in users are redirected to `/jars`. |
| `/jars` | owner | Dashboard: tiles for each jar with title, fine count, unsettled balance; "+ New jar" tile. Empty state with one dashed tile and a line of copy. Sign-out button (a form POST to `/logout`). |
| `/jars/new` | owner | Create form. |
| `/jars/:id` | owner | Jar page: title, description strip, pay button with the owed sticker, grouped history, settle button, edit link. Actions by `intent`: `fine` (optional note), `undo` (fine id), `settle` (optional note). |
| `/jars/:id/edit` | owner | Edit form (including the public link field, with the warning "Changing it stops the old link working."), plus "Delete jar" behind a confirmation step. |\n| `/api/slug?slug=&jar=` | owner | JSON `{ slug, valid, available }` for the form's live check; 401 when signed out; `jar` excludes the caller's own jar. Advisory only, the form action still enforces uniqueness. |
| `/j/:slug` | anyone | Public read-only page, looked up by slug. Private or unknown slug: 404 with no distinguishing detail. If the viewer is the owner, a small "Manage" link to `/jars/:id` appears. Exports `meta` with title and description for link previews. The "Share link" on the owner page copies `APP_URL/j/<slug>`. |
| `/auth/:provider` | anyone | Starts the OAuth flow. |
| `/auth/:provider/callback` | anyone | Finishes it, creates or finds the user, sets the session, redirects to `/jars`. |
| `/logout` | owner | POST only. Clears the session, redirects to `/`. |
| `/account` | owner | POST only, intent `delete`: erases the account and everything in it, clears the session, redirects to `/?deleted=1`. GET redirects to `/jars`. |
| `/terms`, `/privacy` | anyone | Static legal pages rendered from the operator env vars. |

Ownership is checked in every owner loader and action: a jar that exists but belongs to someone else returns 404, not 403.

History grouping: unsettled fines grouped by calendar day ("Today", "Yesterday", then "6 October"), newest first, then each settlement as a single mint row ("8 fines, paid into the holiday fund", total) in reverse order. Any unsettled fine can be deleted. The newest one shows a prominent "Undo" link for the mistap you just made; older unsettled rows show a small "Delete" text link at the right of the note. Settled rows have no delete control.

Form fields:
- Title: required, 1 to 60 characters.
- Description: optional, up to 280 characters.
- Fine amount: decimal text input in the jar's currency, accepts `1`, `1,00`, `1.00`; stored as minor units; must be greater than zero.
- Currency: select from EUR, USD, GBP, CHF, SEK, NOK, DKK, PLN. Default EUR.
- Visibility: private or public. Default private.\n- Public link: optional; pre-filled from the title as it is typed on create, shows the current slug on edit; lowercased; "Use 3 to 40 lowercase letters, digits or dashes." when malformed, "That link is taken." when another jar holds it, "Available" otherwise.

## 6. Auth and sessions

- The Google (with PKCE) and GitHub flows are implemented by hand with fetch in `oauth.server.ts`; the `arctic` package is deprecated on npm. State and code verifier live in a short-lived cookie (10 minutes) set when the flow starts and checked on callback.
- On callback, fetch the profile. For GitHub, if the primary email is hidden, call the emails endpoint and take the primary verified one, or leave email null.
- Upsert the user by `(provider, provider_id)`, refreshing name and avatar.
- Session: React Router's `createCookieSessionStorage`, signed with `SESSION_SECRET`, `httpOnly`, `sameSite=lax`, `secure` outside development, 30-day max age. Payload is only `userId`. Sign-out clears it. There is no server-side session table and therefore no remote revocation; accepted for v1.
- Mutations are same-origin form POSTs behind a lax cookie, which is the CSRF protection. No API tokens exist.
- A `requireUser(request)` helper redirects to `/` when there is no valid session.

## 7. Time, timezone and locale

Every timestamp is stored and transported as ISO 8601 UTC. Conversion to local time happens only at render, in the viewer's own timezone.

The server learns the viewer's timezone from a `tz` cookie. A tiny inline script in the document head, running before anything else, writes the browser's `Intl.DateTimeFormat().resolvedOptions().timeZone` into that cookie on every page load (one year, `sameSite=lax`, not `httpOnly` because the browser writes it). Loaders read it through `getTimeZone(request)`, which validates the value against `Intl.supportedValuesOf("timeZone")` and falls back to UTC when the cookie is missing or invalid. Missing means a first-ever load, a bot, or JavaScript off; the next navigation is correct. The landing page shows no dates, so an owner's first dated page already has the cookie. Travelling updates the cookie on the next load.

Day grouping ("Today", "Yesterday", "6 October") and time display take the timezone as an explicit parameter so they are testable without touching the clock or the process timezone. The process `TZ` is never relied on.

The viewer's locale comes from the `Accept-Language` request header: take the first tag with the highest quality value, canonicalise it with `Intl.getCanonicalLocales` (which throws on junk, so this is wrapped), and fall back to `APP_LOCALE` (default `es-ES`) when the header is missing or invalid. `getLocale(request)` exposes it next to `getTimeZone(request)`. Money is formatted with `Intl.NumberFormat(locale, { style: "currency", currency })`, so the same jar reads "12,50 €" to a Spanish viewer and "€12.50" to an American one, which is correct. Dates use the same locale and the viewer's timezone.

## 8. Visual design (direction C, "Loud")

Reference: `design/c-loud.html`. The other two mockups in `design/` are kept for the record and are not the target.

Tokens:
```
--yellow #FFD83D   page background
--pink   #FF5DA2   primary action (pay)
--blue   #2F5BFF   links, focus ring, one tile color
--mint   #9FE7C2   settled rows, one tile color
--white  #FFFFFF   surfaces
--ink    #000000   text, borders, shadows
```

Type: Bricolage Grotesque, self-hosted from `@fontsource-variable/bricolage-grotesque` so the Docker image has no runtime dependency on Google Fonts. Weights 400 (body), 600 (labels, secondary buttons), 800 (titles, amounts, pay button). Display sizes: 56px dashboard title, 46px jar title, 44px pay button, line-height 0.92, letter-spacing -0.03em. Body 16px, line-height 1.4. Amounts use tabular figures.

Structure:
- Actionable blocks (tiles, pay button, settle button, secondary buttons) have a 3px black border and a hard shadow `6px 6px 0 #000` (8px on the pay button). Pressing translates the block 4px down-right and shrinks the shadow to 2px.
- Passive blocks (history rows, description strip) have the 3px border and no shadow. This is what keeps the pay button the loudest thing on the page.
- "+ New jar" is a dashed border with no fill or shadow.
- Dashboard tiles cycle pink, blue (white text), mint, white by jar index. The first tile spans the full width.
- The owed sticker is a white block rotated -4deg, anchored to the pay button's bottom-right, showing "you owe" and the balance. It stays inside the content column.
- The description strip under the jar title is a white block rotated -1.2deg.
- Visible focus: 3px blue outline, 3px offset. Hit targets at least 44px.

Motion: on a fine, a "+1 €" label (the jar's amount) pops up from the pay button and fades over 600ms, and the sticker balance updates. New history rows appear without animation. All motion is disabled under `prefers-reduced-motion`.

Copy vocabulary, used consistently everywhere:
- Pay button: "Pay 1 €" (the jar's formatted amount).
- Sticker: "you owe" + balance.
- Settle button: "Settle 12,50 €". Confirmation copy: "Settled 12,50 €".
- "Undo" on the latest fine. "Edit jar". "Share link" becomes "Link copied" for two seconds after copying.
- Public link field: "Leave it empty and it is made from the title.", "Available", "That link is taken.", and on edit "Changing it stops the old link working."
- Dashboard subtitle: when every jar uses the same currency, "21,00 € owed. Ouch." (just "Nothing owed." at zero). When currencies are mixed, the sum is meaningless, so the subtitle is the jar count: "Three jars."
- Empty dashboard: "No jars yet. Make one for the thing you keep doing."
- Empty jar: "Nothing in the jar yet." under the pay button.
- Day groups: "Today", "Yesterday", then "6 October". Settlement rows: "Settled 1 October".
- Errors state what to fix: "Title is required.", "Amount must be more than 0."

Money and dates are formatted with `Intl` using the viewer's locale and timezone (section 7). Both are server-rendered so there is no hydration mismatch. Examples in this document use `es-ES`.

## 9. Project structure

```
pay-up/
  app/
    root.tsx                 html shell, font import, tz cookie script, error boundary
    routes.ts                route config
    app.css                  tokens and base styles (Tailwind 4 with the tokens as theme values)
    routes/
      home.tsx               /
      jars.tsx               /jars
      jars.new.tsx           /jars/new
      jars.$id.tsx           /jars/:id   (loader + action with intents)
      jars.$id.edit.tsx      /jars/:id/edit
      j.$id.tsx              /j/:id
      auth.$provider.tsx
      auth.$provider.callback.tsx
      logout.tsx
    lib/
      db.server.ts           open database, pragmas, migrations
      users.server.ts        upsert and find
      jars.server.ts         jar, fine and settlement queries, balance, grouping
      auth.server.ts         Arctic clients, session storage, requireUser
      money.ts               parse and format amounts
      dates.ts               day grouping labels, timezone-aware
      viewer.server.ts       getTimeZone (tz cookie) and getLocale (Accept-Language), validated, with fallbacks
      slugs.ts               public slug generation
      ids.ts                 id generation
    components/              PayButton, Sticker, Tile, HistoryList, JarForm
  design/                    the three mockups
  docs/superpowers/specs/
  Dockerfile
  docker-compose.yml
  .env.example
  react-router.config.ts, vite.config.ts, tsconfig.json, package.json
```

Server-only modules end in `.server.ts` so they never reach the client bundle. Data access is plain SQL through typed functions; no ORM.

## 10. Validation and errors

- Actions validate with zod and return `{ errors }` with field messages on failure; forms show them inline next to the field and keep the user's input.
- Loaders throw `Response` 404 for missing, private (on the public route), or foreign jars.
- Root error boundary shows a plain yellow page with the status and a link back.
- OAuth failures (state mismatch, provider error) redirect to `/?error=signin` and the landing shows one line: "Sign-in didn't complete. Try again."
- Settling with a zero balance returns an error rather than creating an empty settlement.

## 11. Testing

Vitest, Node environment.
- `jars.server.ts` and `users.server.ts` against an in-memory database: balance after fines, settle stamps only unsettled fines and stores the right total, undo refuses settled fines, delete cascades.
- `money.ts` parsing (`1`, `1,5`, `1.50`, junk) and formatting in two locales (`es-ES` gives "12,50 €", `en-US` gives "€12.50").
- `dates.ts` grouping labels across day boundaries in two different timezones (the same 23:30 UTC fine is "Today" in Madrid and "Yesterday" in Los Angeles, or the reverse). `viewer.server.ts` accepts valid zones and locales, picks the highest-quality language tag, and falls back to UTC and `APP_LOCALE` on junk.
- Loaders and actions called directly with a `Request` carrying a test session cookie: foreign jar is 404, private jar is 404 publicly, owner sees manage link, logged-out owner routes redirect.
- No browser tests in v1.

## 12. Docker and configuration

Multi-stage `Dockerfile` on `node:22-slim`: install dependencies, run `react-router build`, copy the build and production dependencies into a slim runtime stage, run `server.js` (a small Express server around `@react-router/express` that trusts the reverse proxy per `TRUST_PROXY`, serves static assets and `/healthz`). SQLite lives at `DATABASE_PATH` (default `/app/data/payup.db` in the image, `./data/payup.db` locally) and compose mounts `./data` there.

Environment:
```
SESSION_SECRET          required, long random string
APP_URL                 required, e.g. https://jars.example.com (OAuth callbacks are built from it)
GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET
DATABASE_PATH           default ./data/payup.db
PORT                    default 3000
TRUST_PROXY             default "loopback, linklocal, uniquelocal"; Express trust-proxy value so request.url reflects the public https origin behind a proxy
APP_LOCALE              default es-ES, used when Accept-Language is missing or invalid
```

A provider whose credentials are missing has its sign-in button hidden instead of failing at click time. If neither provider is configured the landing shows "Sign-in isn't set up yet." in place of the buttons.

## 13. Later, if wanted

Multiplier per tap, visitors adding fines, account deletion, dark mode, stats. Each is a separate brainstorm.
