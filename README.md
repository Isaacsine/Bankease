# BankEase

BankEase is a web-based personal banking workspace that gives a user one place to view and manage multiple linked bank accounts. It is designed as a single customer dashboard rather than a bank core: it stores linked account balances and account metadata, records user-initiated transactions, and provides tools for transfers, savings, airtime, security, and account administration.

The application currently supports:

- Account registration, login, logout, password changes, password reset, and profile management.
- Separate user and administrator login flows.
- Passkey registration and authentication through WebAuthn.
- Linked bank accounts, account aliases, balances, active/paused state, and a default account.
- Transfers between a user\'s linked accounts.
- Transfers to saved beneficiaries.
- Savings goals and contributions funded from a linked account.
- Airtime purchases recorded against a linked account.
- Transaction history and account activity.
- Configurable idle-session timeout and session heartbeat handling.
- An administrator portal for users, sessions, permissions, security status, analytics, and audit logs.
- English-language UI support through the shared `i18n.js` client module.

## Architecture

BankEase is a server-rendered static frontend backed by a single Node.js service:

```text
Browser
  |
  | HTML pages, CSS, browser JavaScript, same-origin fetch()
  v
Express application (server.js)
  |-- security middleware: Helmet, CSP frame protection, rate limiting, same-origin checks
  |-- cookie-session authentication and idle-session validation
  |-- REST API for users, accounts, transfers, goals, transactions, passkeys, and admin actions
  |-- static-file serving for HTML, CSS, JavaScript, and assets
  v
Supabase PostgreSQL
  |-- users, sessions, passkeys, audit logs
  |-- banks, beneficiaries, savings goals, transactions
  |-- security-definer functions for balance-changing operations
```

### Frontend

The frontend is made up of standalone HTML pages in the repository root. Shared browser behavior is split across `script.js`, `auth.js`, `theme.js`, `i18n.js`, `passkeys.js`, and `session-timeout.js`. Shared styles live in `css/style.css`, `css/responsive.css`, and `css/dashboard.css`. The `admin/` directory contains the administrator page and its separate styling and client logic.

Pages are served by Express and call the API with same-origin `fetch()` requests. The root `index.html` redirects visitors to `dashboard.html`; authentication pages redirect users after a successful login or registration.

### Backend

`server.js` is both the Express application entry point and the API implementation. It:

- Loads configuration from environment variables with `dotenv`.
- Uses `cookie-session` for the browser session cookie.
- Stores server-side session records in Supabase `user_sessions` and validates their activity on API requests.
- Hashes passwords with `bcryptjs`.
- Implements passkeys with `@simplewebauthn/server`.
- Uses `helmet`, a frame-ancestors policy, same-origin checks, JSON body limits, and separate general/auth rate limits.
- Uses `supabase-client.js` to access Supabase with a server-only secret key.
- Serves the static application after the API routes.

`api/index.js` exports the same Express application for platforms that use a serverless entry point.

### Data layer

`supabase-schema.sql` defines the PostgreSQL schema, indexes, row-level security enablement, and transactional database functions. The balance-changing operations are implemented as database functions so the balance update and transaction/audit records are committed together:

- `transfer_between_banks`
- `transfer_to_beneficiary`
- `set_bank_active_state`
- `set_default_bank`
- `contribute_to_savings_goal`
- `delete_empty_savings_goal`
- `purchase_airtime`

The application connects with the Supabase service-role key from the server. That key must never be exposed in browser code. The schema revokes table and function access from `anon` and `authenticated` and grants the listed functions to `service_role`.

## API surface

The API is implemented in `server.js` and uses JSON responses. Main route groups are:

| Area | Routes |
| --- | --- |
| Health | `GET /api/health` |
| Auth | `POST /api/register`, `/api/login`, `/api/logout`, `/api/me` |
| Passwords | `POST /api/change-password`, `/api/forgot-password`, `/api/reset-password` |
| Passkeys | `GET /api/passkeys/status`, registration and authentication options/verification, `DELETE /api/passkeys` |
| Sessions | `GET/POST /api/session/settings`, `POST /api/session/heartbeat` |
| Accounts | `GET/POST /api/banks`, `PATCH /api/banks/:id`, status/default updates, `DELETE /api/banks/:id` |
| Beneficiaries | `GET/POST /api/beneficiaries`, `DELETE /api/beneficiaries/:id` |
| Savings | `GET/POST /api/savings-goals`, goal details/deletion, contributions |
| Payments | `POST /api/transfers`, `/api/beneficiary-transfers`, `/api/airtime` |
| Activity | `GET /api/transactions` |
| Administration | `/api/admin/overview`, users, admins, sessions, and audit data |

All protected routes require the signed session cookie. Administrator routes additionally require an active user with the `admin` role.

## Repository layout

| Path | Responsibility |
| --- | --- |
| `server.js` | Express server, middleware, authentication, API routes, and static hosting |
| `api/index.js` | Serverless export of the Express app |
| `supabase-schema.sql` | Supabase schema, indexes, RLS enablement, and database functions |
| `supabase-client.js` | Server-only Supabase client and retrying fetch wrapper |
| `migrate-to-supabase.js` | Legacy SQLite user migration utility |
| `*.html` | User-facing application pages |
| `admin/` | Administrator portal |
| `css/` | Shared and responsive styles |
| `assets/` | Logos, bank images, and other static assets |
| `auth.js`, `passkeys.js` | Authentication and WebAuthn browser flows |
| `script.js`, `theme.js`, `i18n.js` | Shared application behavior, theme, and translations |
| `session-timeout.js` | Client-side idle timeout coordination |
| `render.yaml` | Render web-service configuration |
| `vercel.json` | Vercel Node deployment configuration |

## Local development

### Prerequisites

- Node.js 18 or newer.
- A Supabase project with the schema applied.
- A long, random session secret.

### Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env` and set the values described below.

3. Run `supabase-schema.sql` in the Supabase SQL editor or through the Supabase CLI.

4. Start the application:

   ```bash
   npm start
   ```

5. Open `http://localhost:3000`.

For development with automatic server restarts:

```bash
npm run dev
```

The configured test script is currently a placeholder and does not execute automated tests:

```bash
npm test
```

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `PORT` | No | HTTP port; defaults to `3000`. |
| `NODE_ENV` | Recommended in production | Set to `production` to enable secure cookies. |
| `SESSION_SECRET` | Yes | Secret used to sign the `bankees.sid` cookie. Render can generate it from `render.yaml`. |
| `SUPABASE_URL` | Yes | Base HTTPS URL of the Supabase project. |
| `SUPABASE_SECRET_KEY` | Yes | Server-only Supabase secret/service-role key. Do not expose it to the browser. |
| `SUPABASE_SERVICE_ROLE_KEY` | Alternative | Accepted by `supabase-client.js` as an alternative to `SUPABASE_SECRET_KEY`. |
| `SUPABASE_PUBLISHABLE_KEY` | No | Present in the example file, but the current server client does not use it. |
| `PASSWORD_RESET_BASE_URL` | Required for deployed reset links | Public origin used when building password-reset links. |
| `WEBAUTHN_RP_ID` | No | WebAuthn relying-party ID; defaults to the request hostname. |
| `WEBAUTHN_ORIGIN` | No | Expected WebAuthn origin; defaults to the current request origin. |

Never commit `.env`, service-role keys, session secrets, or password-reset secrets.

## Supabase setup and migration

The normal application path is Supabase. Apply `supabase-schema.sql` before starting the server. The schema includes the application tables, constraints, indexes, and function grants required by the API.

`migrate-to-supabase.js` is a one-time compatibility utility for importing users from the legacy read-only `bankees.db` SQLite file:

```bash
npm run migrate:supabase
```

This utility expects a local `bankees.db` and the `better-sqlite3` package. `better-sqlite3` is not part of the current `package.json` dependencies, so install or add that package before running the migration if it is not already available. The migration only imports user records; linked accounts and other domain data must be migrated separately if needed.

## Deployment

### Render

`render.yaml` defines a Node web service that runs `npm install` followed by `npm start`. Configure `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SESSION_SECRET`, and `PASSWORD_RESET_BASE_URL` in the Render environment. Set `PASSWORD_RESET_BASE_URL` to the deployed HTTPS origin.

### Vercel

`vercel.json` routes requests to `server.js` through `@vercel/node`. Configure the same environment variables in the Vercel project settings. WebAuthn values may need explicit `WEBAUTHN_RP_ID` and `WEBAUTHN_ORIGIN` when the deployment hostname differs from the request hostname.

## Security notes

- Passwords are stored as bcrypt hashes, never as plaintext.
- Sessions use an HTTP-only, same-site cookie and are tracked in the database so they can expire or be revoked.
- Authentication and password-reset endpoints have stricter rate limits than ordinary API requests.
- API writes are protected by same-origin checks.
- Administrator authorization is checked on the server, not only in the admin UI.
- Audit records are written for login/session and important account, transfer, savings, and administrator actions.
- Balance-changing operations verify ownership, active account state, sufficient balance, and valid amounts inside database transactions.
- Keep the Supabase service-role key exclusively on the server and rotate it if it is exposed.

## Project status

BankEase is a functional application prototype with a Supabase-backed persistence layer and production-oriented security middleware. It does not connect to real bank networks or process real-world payments; linked accounts, balances, airtime purchases, and transfers represent data managed within the BankEase application.