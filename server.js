// Entry point — Express server initialization
import crypto from 'crypto';
import express from 'express';
import session from 'express-session';
import lusca from 'lusca';
import rateLimit from 'express-rate-limit';
import {fileURLToPath} from 'url';
import {dirname, join} from 'path';
import webhookRouter from './src/routes/webhook.js';
import debugRouter from './src/routes/debug.js';
import {logAccess} from './src/crm.js';
import {PORT, DEBUG_API_KEY, RATE_LIMIT_WINDOW_MS, DASHBOARD_RATE_LIMIT_MAX, WEBHOOK_RATE_LIMIT_MAX} from './src/config.js';
import {formatColombiaTime} from './src/utils/time.js';
import {startReengagementPoller} from './src/reengagement.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
// Capture raw body for Meta HMAC verification (signature is over raw bytes, not re-serialized JSON)
app.use(express.json({
    verify: (req, _res, buf) => {
        if (buf && buf.length) req.rawBody = buf;
    },
}));

// Trust first proxy (Render HTTPS termination)
app.set('trust proxy', 1);

// Server-side session — HttpOnly + Secure cookie, no API key stored on client
const SESSION_SECRET = crypto.randomBytes(32).toString('hex');
// Session is used only by /dashboard/* — CSRF is applied via app.use('/dashboard', lusca.csrf()).
// All other POST routes (/webhook, /debug/reset/:phone) are machine-to-machine and suppressed individually.
// lgtm[js/missing-token-validation]
app.use(session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000,
    },
}));

// Mount machine-to-machine routes before CSRF middleware (explicitly CSRF-exempt)
app.use('/webhook', webhookLimiter, webhookRouter);
app.use('/debug', debugRouter);

// ── CSRF protection for all remaining session-backed routes
app.use(lusca.csrf());

// Dashboard — CSRF token endpoint (public with session, no auth needed — token is tied to session)
app.get('/dashboard/csrf-token', (req, res) => {
    res.json({csrfToken: req.csrfToken()});
});

// Dashboard login — validates API key and establishes server-side session
app.post('/dashboard/login', (req, res) => {
    if (req.body?.apiKey === DEBUG_API_KEY) {
        req.session.authenticated = true;
        return res.json({success: true});
    }
    return res.status(401).json({success: false, error: 'Invalid API key'});
});

// Dashboard session check — confirms existing session without exposing the key
app.get('/dashboard/check-session', (req, res) => {
    res.json({authenticated: !!req.session?.authenticated});
});

// Rate limit: per-IP ceiling for dashboard and debug endpoints
const getLimiter = rateLimit({
    windowMs: RATE_LIMIT_WINDOW_MS,
    max: DASHBOARD_RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
});

// Rate limit: per-IP ceiling for inbound webhooks (Meta server IPs).
// Generous ceiling so legitimate Meta traffic is never blocked; defense-in-depth
// against floods that would exhaust connections/CPU before the HMAC check runs.
const webhookLimiter = rateLimit({
    windowMs: RATE_LIMIT_WINDOW_MS,
    max: WEBHOOK_RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests' },
});

// Serve assets (logo) and dashboard on non-obvious route
app.use('/assets', express.static(join(__dirname, 'assets')));
app.get('/dashboard-valeria-statistics', getLimiter, (req, res) => {
    logAccess('/dashboard', req).catch(() => {}); // fire-and-forget audit
    res.sendFile(join(__dirname, 'public', 'dashboard.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`\n🦷 Valeria listening on port ${PORT}`);
    console.log('👩‍⚕️ Valeria — asistente dental de WhatsApp listo');
    console.log(`🕐 ${formatColombiaTime()}\n`);

    // Durable re-engagement follow-ups (recovers any rows due during downtime).
    startReengagementPoller()
        .catch(err => log.error('reengagement poller failed to start', err));
});
