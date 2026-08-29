// Durable re-engagement scheduler.
//
// Instead of holding a setTimeout in memory (lost on every Render deploy/crash),
// we persist pending follow-ups in `reengagement_queue` and let a poller send the
// ones whose `scheduled_at` has passed. This survives restarts and lets us recover
// any rows that were due while the process was down.

import {getDb} from './db/client.js';
import {sendMessage} from './whatsapp.js';
import log from './utils/logger.js';

// How often the poller wakes up. 60s stays well within Supabase free-tier
// request budgets (and respects the "don't poll more than once a minute" rule).
const POLL_INTERVAL_MS = 60_000;

let pollTimer = null;

// Cancel any still-pending rows for this phone, then insert a fresh one.
// The cancel-first pattern is what makes "reset the timer" idempotent.
export async function scheduleReengagement(phone, message, phase, delayMs) {
    const db = getDb();
    await db
        .from('reengagement_queue')
        .update({cancelled: true})
        .eq('phone', phone)
        .eq('sent', false);

    await db.from('reengagement_queue').insert({
        phone,
        message,
        phase,
        scheduled_at: new Date(Date.now() + delayMs).toISOString(),
    });
}

// Mark all pending rows for this phone as cancelled (e.g. when the patient
// responds and we no longer want the follow-up to fire).
export async function cancelReengagement(phone) {
    const db = getDb();
    await db
        .from('reengagement_queue')
        .update({cancelled: true})
        .eq('phone', phone)
        .eq('sent', false);
}

async function pollReengagements() {
    try {
        const db = getDb();
        const now = new Date();
        const {data, error} = await db
            .from('reengagement_queue')
            .select('*')
            .eq('sent', false)
            .eq('cancelled', false)
            .lte('scheduled_at', now.toISOString());

        if (error) {
            log.warn({err: error.message}, 'reengagement poll select failed');
            return;
        }

        const due = (data || []).filter(
            (r) => !r.sent && !r.cancelled && new Date(r.scheduled_at) <= now,
        );

        for (const row of due) {
            try {
                await sendMessage(row.phone, row.message);
                await db
                    .from('reengagement_queue')
                    .update({sent: true, sent_at: new Date().toISOString()})
                    .eq('id', row.id);
            } catch (err) {
                log.error({err: err.message, id: row.id}, 'reengagement send failed');
            }
        }
    } catch (err) {
        log.error({err: err.message}, 'reengagement poll crashed');
    }
}

export async function startReengagementPoller() {
    if (pollTimer) return;
    // Recover any rows that became due while the process was offline.
    await pollReengagements();
    pollTimer = setInterval(pollReengagements, POLL_INTERVAL_MS);
    log.info('reengagement poller started');
}

export function stopReengagementPoller() {
    if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
    }
}
