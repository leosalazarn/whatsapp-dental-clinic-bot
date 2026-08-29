// Debug routes — CRM inspection and statistics
import express from 'express';
import {getAllPatients, getStats, logAccess, deletePatient, findPatient} from '../crm.js';
import {getAllSessions, resetSessionCache} from '../session.js';
import {getDb} from '../db/client.js';
import {cancelReengagement} from '../reengagement.js';
import {formatColombiaTime} from '../utils/time.js';
import {PRACTICE_NAME, PRACTICE_LOCATION, DEBUG_API_KEY, CONVERSION_PHASES} from '../config.js';
import log from '../utils/logger.js';

const router = express.Router();

// ── Auth Middleware — check server session first, then x-api-key header fallback
const auth = (req, res, next) => {
    if (req.session?.authenticated) {
        return next();
    }
    const apiKey = req.headers['x-api-key'];
    if (apiKey === DEBUG_API_KEY) {
        next();
    } else {
        res.status(401).json({error: 'Unauthorized — Invalid or missing x-api-key'});
    }
};

// GET / — health check (Public)
router.get('/', (req, res) => {
    res.json({
        status: '🦷 Valeria activa',
        service: `${PRACTICE_NAME} · ${PRACTICE_LOCATION}`,
        hora: formatColombiaTime(),
    });
});

// GET /leads — all patients (Protected)
router.get('/leads', auth, async (req, res) => {
    logAccess('/debug/leads', req).catch(() => {}); // fire-and-forget audit
    const patients = await getAllPatients();
    res.json({patients});
});

// GET /stats — CRM lead statistics (Protected)
router.get('/stats', auth, async (req, res) => {
    logAccess('/debug/stats', req).catch(() => {}); // fire-and-forget audit
    const stats = await getStats();
    res.json(stats);
});

// GET /metrics — conversion funnel (Protected)
router.get('/metrics', auth, async (req, res) => {
    logAccess('/debug/metrics', req).catch(() => {}); // fire-and-forget audit
    const sessions = await getAllSessions();
    const total = sessions.length;

    if (total === 0) {
        return res.json({ message: 'No active sessions yet.' });
    }

    // ── Funnel: how many sessions reached each phase
    const funnel = {};
    for (const phase of CONVERSION_PHASES) {
        const reached = sessions.filter(s =>
            s.metrics?.phase_timestamps?.[phase] !== null &&
            s.metrics?.phase_timestamps?.[phase] !== undefined
        ).length;
        funnel[phase] = {
            count: reached,
            rate: total > 0 ? `${((reached / total) * 100).toFixed(1)}%` : '0%',
        };
    }

    // ── Drop-off between consecutive phases
    const dropoff = {};
    for (let i = 1; i < CONVERSION_PHASES.length; i++) {
        const from = CONVERSION_PHASES[i - 1];
        const to = CONVERSION_PHASES[i];
        const fromCount = funnel[from].count;
        const toCount = funnel[to].count;
        const lost = fromCount - toCount;
        dropoff[`${from} → ${to}`] = {
            lost,
            drop_rate: fromCount > 0 ? `${((lost / fromCount) * 100).toFixed(1)}%` : '0%',
        };
    }

    // ── Response time: avg ms from first contact to first Valeria reply
    const responseTimes = sessions
        .map(s => s.metrics?.first_response_ms)
        .filter(t => t !== null && t !== undefined);
    const avgResponseMs = responseTimes.length > 0
        ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
        : null;

    // ── Time to convert: avg ms from first contact to reaching PAYMENT phase
    const timeToPayment = sessions
        .filter(s => s.metrics?.phase_timestamps?.PAYMENT)
        .map(s => new Date(s.metrics.phase_timestamps.PAYMENT) - new Date(s.metrics.first_contact));
    const avgTimeToPaymentMin = timeToPayment.length > 0
        ? Math.round(timeToPayment.reduce((a, b) => a + b, 0) / timeToPayment.length / 60000)
        : null;

    // ── Reengagement stats
    const reengagementSent = sessions.filter(s => s.metrics?.reengagement_sent).length;
    const reengagementRecovered = sessions.filter(s => s.metrics?.reengagement_recovered).length;

    // ── Source breakdown
    const bySource = sessions.reduce((acc, s) => {
        acc[s.source] = (acc[s.source] || 0) + 1;
        return acc;
    }, {});

    // ── Router telemetry
    const routerAgg = sessions.reduce((acc, s) => {
        const r = s.metrics?.router;
        if (!r) return acc;
        for (const [layer, count] of Object.entries(r.by_layer || {})) {
            acc.by_layer[layer] = (acc.by_layer[layer] || 0) + count;
        }
        for (const [model, count] of Object.entries(r.by_model || {})) {
            acc.by_model[model] = (acc.by_model[model] || 0) + count;
        }
        for (const [key, val] of Object.entries(r.tokens || {})) {
            acc.tokens[key] = (acc.tokens[key] || 0) + val;
        }
        acc.total_calls += r.total_calls || 0;
        if (r.last_model) {
            acc.last_model_counts[r.last_model] = (acc.last_model_counts[r.last_model] || 0) + 1;
        }
        return acc;
    }, { by_layer: {}, by_model: {}, tokens: {}, total_calls: 0, last_model_counts: {} });

    const totalRouted = routerAgg.total_calls;
    const llmCalls = routerAgg.by_layer.llm || 0;
    const haikuCalls = routerAgg.by_model.haiku || 0;
    const sonnetCalls = routerAgg.by_model.sonnet || 0;
    const haikuInput = routerAgg.tokens.haiku_input || 0;
    const haikuOutput = routerAgg.tokens.haiku_output || 0;
    const sonnetInput = routerAgg.tokens.sonnet_input || 0;
    const sonnetOutput = routerAgg.tokens.sonnet_output || 0;

    // Rough cost: Sonnet $3/M in, $15/M out; Haiku $0.25/M in, $1.25/M out
    const currentCost = (sonnetInput / 1e6 * 3) + (sonnetOutput / 1e6 * 15)
        + (haikuInput / 1e6 * 0.25) + (haikuOutput / 1e6 * 1.25);
    const allSonnetCost = ((sonnetInput + haikuInput) / 1e6 * 3)
        + ((sonnetOutput + haikuOutput) / 1e6 * 15);

    res.json({
        generated_at: formatColombiaTime(),
        total_sessions: total,
        funnel,
        dropoff,
        response_time: {
            avg_first_response_ms: avgResponseMs,
            avg_first_response_s: avgResponseMs ? (avgResponseMs / 1000).toFixed(1) : null,
            sample_size: responseTimes.length,
        },
        time_to_payment: {
            avg_minutes: avgTimeToPaymentMin,
            sample_size: timeToPayment.length,
        },
        reengagement: {
            sent: reengagementSent,
            recovered: reengagementRecovered,
            recovery_rate: reengagementSent > 0
                ? `${((reengagementRecovered / reengagementSent) * 100).toFixed(1)}%`
                : '0%',
        },
        router: {
            total_calls: totalRouted,
            by_layer: routerAgg.by_layer,
            by_model: routerAgg.by_model,
            llm_percent: totalRouted > 0 ? `${((llmCalls / totalRouted) * 100).toFixed(1)}%` : '0%',
            sonnet_percent: totalRouted > 0 ? `${((sonnetCalls / totalRouted) * 100).toFixed(1)}%` : '0%',
            haiku_percent: totalRouted > 0 ? `${((haikuCalls / totalRouted) * 100).toFixed(1)}%` : '0%',
            last_session_model: routerAgg.last_model_counts,
            total_tokens: {
                haiku_input: haikuInput,
                haiku_output: haikuOutput,
                sonnet_input: sonnetInput,
                sonnet_output: sonnetOutput,
            },
            estimated_cost_usd: {
                current: parseFloat(currentCost.toFixed(4)),
                all_sonnet_baseline: parseFloat(allSonnetCost.toFixed(4)),
                savings: parseFloat((allSonnetCost - currentCost).toFixed(4)),
            },
        },
        by_source: bySource,
    });
});

// POST /debug/reset/:phone is API-key authenticated (x-api-key header),
// not session-based — CSRF does not apply to this machine-to-machine route.
// lgtm[js/missing-token-validation]
// POST /reset/:phone — reset a conversation to its initial state (Protected)
// Resets the persisted Supabase row, drops the in-memory cache so the next
// message reloads fresh, and cancels any pending re-engagement follow-ups.
router.post('/reset/:phone', auth, async (req, res) => {
    const phone = decodeURIComponent(req.params.phone);
    try {
        const db = getDb();
        const { data, error } = await db.from('conversations').update({
            phase: 'START',
            name: null,
            aesthetic_goal: null,
            full_name: null,
            email: null,
            consultation_reason: null,
            data_complete: false,
            payment_info_sent: false,
            message_count: 0,
            history: [],
        }).eq('phone', phone).select('phone');

        if (error) {
            log.error({err: error.message, phone}, 'reset conversation failed');
            return res.status(500).json({error: 'Failed to reset conversation', detail: error.message});
        }
        if (!data || data.length === 0) {
            return res.status(404).json({ error: 'Phone not found', phone });
        }

        // Drop in-memory cache so the next message reads fresh from Supabase.
        resetSessionCache(phone);

        // Cancel any pending re-engagement follow-ups for this phone.
        await cancelReengagement(phone);

        res.json({success: true, phone});
    } catch (err) {
        log.error({err: err.message, phone}, 'reset crashed');
        res.status(500).json({error: 'Internal error', detail: err.message});
    }
});

// DELETE /debug/patient/:phone — full erasure (right-to-erasure, Ley 1581)
// API-key authenticated (x-api-key header). Permanently deletes all patient data.
router.delete('/patient/:phone', auth, async (req, res) => {
    const { phone } = req.params;
    try {
        const existing = await findPatient(phone);
        if (!existing) {
            return res.status(404).json({ error: 'Patient not found', phone });
        }
        await deletePatient(phone);
        await resetSessionCache(phone); // clear in-memory session
        log.info(`[ERASURE] Patient ${phone.slice(-4)} permanently deleted`);
        res.json({ deleted: true, phone });
    } catch (err) {
        log.error('erasure failed', err);
        res.status(500).json({ error: 'Erasure failed' });
    }
});

export default router;