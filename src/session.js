// Session module — persistent session store with Supabase
import {getDb} from './db/client.js';
import {MAX_HISTORY, SESSION_EXPIRY_HOURS, CLEANUP_INTERVAL_MINUTES} from './config.js';
import log from './utils/logger.js';

const sessions = new Map();

async function loadSessionFromDB(phone) {
    const supabase = getDb();
    try {
        const {data, error} = await supabase
            .from('conversations')
            .select('*')
            .eq('phone', phone)
            .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 = row not found
            log.error('loadSessionFromDB', error);
            return null;
        }
        return data;
    } catch (err) {
        log.error('loadSessionFromDB', err);
        return null;
    }
}

async function saveSessionToDB(phone, session) {
    const supabase = getDb();
    try {
        const record = {
            phone,
            phase: session.phase,
            history: session.history,
            name: session.name,
            aesthetic_goal: session.aesthetic_goal,
            source: session.source,
            trigger_message: session.trigger_message,
            full_name: session.full_name,
            email: session.email,
            consultation_reason: session.consultation_reason,
            data_complete: session.data_complete,
            payment_info_sent: session.payment_info_sent,
            message_count: session.message_count,
            last_interaction: session.last_interaction,
            metrics: session.metrics,
        };

        const {error} = await supabase
            .from('conversations')
            .upsert(record, {onConflict: 'phone'});

        if (error) log.error('saveSessionToDB', error);
    } catch (err) {
        log.error('saveSessionToDB', err);
    }
}

// Auto-cleanup sessions older than SESSION_EXPIRY_HOURS
setInterval(() => {
    const now = new Date();
    const expiryMs = SESSION_EXPIRY_HOURS * 60 * 60 * 1000;

    for (const [phone, session] of sessions.entries()) {
        const lastInteraction = new Date(session.last_interaction);
        if (now - lastInteraction > expiryMs) {
            if (session.reengagement_timer) clearTimeout(session.reengagement_timer);
            sessions.delete(phone);
            log.info(`Session expired and purged: ${phone}`);
        }
    }
}, CLEANUP_INTERVAL_MINUTES * 60 * 1000);

export async function getSession(phone) {
    if (!sessions.has(phone)) {
        // Try to load from DB first
        const dbSession = await loadSessionFromDB(phone);
        if (dbSession) {
            // Restore session from DB
            sessions.set(phone, {
                ...dbSession,
                reengagement_timer: null, // Timers don't persist
                last_interaction: new Date().toISOString(), // Update on load
            });
        } else {
            // Create new session
            sessions.set(phone, {
                history: [],
                name: null,
                aesthetic_goal: null,
                phase: 'START',
                source: 'ORGANIC',
                trigger_message: null,
                reengagement_timer: null,
                last_interaction: new Date().toISOString(),
                full_name: null,
                email: null,
                consultation_reason: null,
                data_complete: false,
                message_count: 0,
                payment_info_sent: false,
                metrics: {
                    first_contact: new Date().toISOString(),
                    first_response_ms: null,
                    reengagement_sent: false,
                    reengagement_recovered: false,
                    phase_timestamps: {
                        START: new Date().toISOString(),
                        EXTRACTION: null,
                        HOOK: null,
                        DATA_CAPTURE: null,
                        PAYMENT: null,
                        CLOSING: null,
                    },
                },
            });
        }
    }
    const session = sessions.get(phone);
    session.last_interaction = new Date().toISOString();
    return session;
}

export async function updateSession(phone, data) {
    const session = await getSession(phone);
    Object.assign(session, data);
    session.last_interaction = new Date().toISOString();
    // Persist to DB
    await saveSessionToDB(phone, session);
}

export async function addMessageToHistory(phone, role, content) {
    const session = await getSession(phone);
    session.history.push({role, content});

    // Enforce sliding window: keep only MAX_HISTORY messages
    if (session.history.length > MAX_HISTORY) {
        session.history.shift();
    }
    // Persist after adding message
    await saveSessionToDB(phone, session);
}

// Drop an entry from the in-memory session Map so the next message reloads
// fresh from Supabase (used by the debug reset endpoint). Also clears any
// pending in-memory re-engagement timer attached to the session.
export function resetSessionCache(phone) {
    const session = sessions.get(phone);
    if (session?.reengagement_timer) clearTimeout(session.reengagement_timer);
    sessions.delete(phone);
}

export function clearReengagementTimer(phone) {
    const session = sessions.get(phone);
    if (session && session.reengagement_timer) {
        clearTimeout(session.reengagement_timer);
        session.reengagement_timer = null;
    }
}

export function setReengagementTimer(phone, callback, delayMs) {
    clearReengagementTimer(phone);
    const session = sessions.get(phone);
    if (session) {
        session.reengagement_timer = setTimeout(callback, delayMs);
    }
}

// Record when a phase transition happens
export async function recordPhase(phone, phase) {
    const session = await getSession(phone);
    if (session?.metrics?.phase_timestamps) {
        session.metrics.phase_timestamps[phase] = new Date().toISOString();
    }
    // Persist phase change
    await saveSessionToDB(phone, session);
}

// Record ms from first contact to first Valeria response
export async function recordFirstResponse(phone) {
    const session = await getSession(phone);
    if (session?.metrics && session.metrics.first_response_ms === null) {
        const start = new Date(session.metrics.first_contact).getTime();
        session.metrics.first_response_ms = Date.now() - start;
    }
    // Persist metrics
    await saveSessionToDB(phone, session);
}

// Record router telemetry for this interaction
export async function recordRouting(phone, { layer, route, modelKey, input_tokens, output_tokens }) {
    const session = await getSession(phone);
    if (!session?.metrics) return;

    if (!session.metrics.router) {
        session.metrics.router = {
            by_layer: { phase: 0, keyword: 0, length: 0, llm: 0 },
            by_model: { haiku: 0, sonnet: 0 },
            tokens: { haiku_input: 0, haiku_output: 0, sonnet_input: 0, sonnet_output: 0 },
            last_model: null,
            total_calls: 0,
        };
    }

    const r = session.metrics.router;
    r.by_layer[layer] += 1;
    r.by_model[modelKey] += 1;
    r.tokens[`${modelKey}_input`] += input_tokens || 0;
    r.tokens[`${modelKey}_output`] += output_tokens || 0;
    r.last_model = modelKey;
    r.total_calls += 1;

    await saveSessionToDB(phone, session);
}

// Return all persistent sessions from DB (for metrics endpoint)
export async function getAllSessions() {
    const supabase = getDb();
    try {
        const {data, error} = await supabase
            .from('conversations')
            .select('phone, phase, source, name, aesthetic_goal, data_complete, last_interaction, metrics');

        if (error) {
            log.error('getAllSessions', error);
            return [];
        }

        return data;
    } catch (err) {
        log.error('getAllSessions', err);
        return [];
    }
}