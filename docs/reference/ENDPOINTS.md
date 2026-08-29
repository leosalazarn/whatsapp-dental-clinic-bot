# API Endpoints — Valeria WhatsApp Bot

| Method | Route                         | Purpose                                 | Auth                         |
|--------|-------------------------------|-----------------------------------------|------------------------------|
| GET    | /debug/                       | Health check                            | Public                       |
| GET    | /webhook                      | Meta verification                       | Public                       |
| POST   | /webhook                      | Receive WhatsApp messages               | Public                       |
| GET    | /debug/leads                  | All persistent patients (Supabase)      | x-api-key or session         |
| GET    | /debug/stats                  | Summary by source/status/intent         | x-api-key or session         |
| GET    | /debug/metrics                | Funnel & response time analytics        | x-api-key or session         |
| GET    | /dashboard-valeria-statistics | Lead Dashboard UI (HTML)                | Rate-limited (30/15 min)     |
| POST   | /dashboard/login              | Validate API key, create server session | CSRF token + API key in body |
| GET    | /dashboard/csrf-token         | Get CSRF token for the current session  | Session cookie               |
| GET    | /dashboard/check-session      | Check if session is active              | Session cookie               |
| POST   | /debug/reset/:phone           | Reset conversation & clear session      | x-api-key                    |
| DELETE | /debug/patient/:phone         | Full patient erasure (Ley 1581)         | x-api-key                    |

## Notes

- Debug endpoints (`/debug/leads`, `/debug/stats`, `/debug/metrics`) accept **either** `x-api-key` header **or** an
  active `express-session` cookie (established via `POST /dashboard/login`).
- The dashboard route (`/dashboard-valeria-statistics`) is rate-limited to 30 requests per 15 minutes per IP.
- Session cookies are HttpOnly, sameSite lax, 24-hour expiry. `secure: true` in production (enforced by
  `NODE_ENV === 'production'`), `false` locally for HTTP dev.
- CSRF protection via `lusca.csrf()` on all `/dashboard/*` POST routes. Client must send `x-csrf-token` header
  (fetched from `GET /dashboard/csrf-token` on page load).
