# Pay Up

Make a jar for the thing you keep doing. Tap it when you do it. Settle up when it hurts.

## Run it locally

1. `nvm use` (Node 22.22 or newer), then `npm install`.
2. `cp .env.example .env` and fill in `SESSION_SECRET` (`openssl rand -base64 32`) and at least one provider.
3. `npm run dev` and open http://localhost:5173. In development `APP_URL` must match that origin, so set `APP_URL=http://localhost:5173` in `.env` and register callbacks against it.

## OAuth apps

- GitHub: Settings → Developer settings → OAuth Apps → New. Callback URL `${APP_URL}/auth/github/callback`. Copy client id and secret into `.env`.
- Google: Cloud Console → APIs & Services → Credentials → OAuth client ID (Web application). Authorized redirect URI `${APP_URL}/auth/google/callback`. Configure the consent screen with the `openid`, `email`, `profile` scopes.

A provider whose pair is empty in `.env` simply has no button on the landing page.

## Test, typecheck, build

- `npm test`
- `npm run typecheck`
- `npm run build` then `npm start` serves the production build on `PORT` (default 3000) through `server.js`, a small Express server that trusts the reverse proxy in front of it (see `TRUST_PROXY`). A `/healthz` endpoint answers `ok`.

## Docker

```
cp .env.example .env   # fill it in; APP_URL is the public https origin
docker compose up --build -d
```

The SQLite file lives in `./data` on the host. Back it up by copying that folder. Cookies are marked `secure` in production, so put the container behind HTTPS.

## Configuration

| Variable | Required | Default |
|---|---|---|
| `SESSION_SECRET` | yes | |
| `APP_URL` | yes | |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | one provider pair | |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | one provider pair | |
| `DATABASE_PATH` | no | `./data/payup.db` (`/app/data/payup.db` in Docker) |
| `APP_LOCALE` | no | `es-ES`, used when the browser sends no usable Accept-Language |
| `OPERATOR_NAME` / `CONTACT_EMAIL` | for a public deployment | shown on the Terms and Privacy pages; the pages say they are not configured until you set them |
| `TRUST_PROXY` | behind a reverse proxy | `loopback, linklocal, uniquelocal`: trusts X-Forwarded-* from private-network proxies such as a Docker network or a proxy on the same host. Set to `true` to trust any, or an Express trust-proxy value. The server also treats every request as addressed to `APP_URL`, so form posts work behind any proxy as long as `APP_URL` is the public origin. |
| `PORT` | no | `3000` |

Legal pages live at `/terms` and `/privacy` (plain-language drafts, not legal advice; set `OPERATOR_NAME` and `CONTACT_EMAIL`). There is no cookie banner because the only cookies are the session, the ten-minute sign-in cookie and the timezone cookie. Users can delete their account from the dashboard.

Public links are `/j/<slug>`: the slug is made from the title (or typed by you), checked live for availability, and changing it on the edit page stops the old link working.

Dates render in the viewer's browser timezone (a `tz` cookie set on first load); money renders in the viewer's locale.
