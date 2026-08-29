// CRM module — Supabase-backed patient store
// Interface unchanged: findPatient, upsertPatient, getAllPatients, getStats
import {getDb} from './db/client.js';
import {getColombiaNow} from './utils/time.js';
import log from './utils/logger.js';

export async function findPatient(phone) {
    const supabase = getDb();
    try {
        const {data, error} = await supabase
            .from('patients')
            .select('*')
            .eq('phone', phone)
            .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 = row not found
            log.error('findPatient', error);
        }
        return data || null;
    } catch (err) {
        log.error('findPatient', err);
        return null;
    }
}

export async function upsertPatient(data) {
    const supabase = getDb();
    try {
        const now = getColombiaNow();
        const existing = await findPatient(data.phone);

        const record = existing
            ? {...existing, ...data, last_interaction: now}
            : {
                phone: data.phone,
                name: data.name || null,
                status: data.status || 'NEW',
                aesthetic_goal: data.aesthetic_goal || null,
                source: data.source || 'ORGANIC',
                trigger_message: data.trigger_message || null,
                first_contact: now,
                last_interaction: now,
                notes: data.notes || '',
                last_intent: data.last_intent || 'OTHER',
                full_name: data.full_name || null,
                email: data.email || null,
                consultation_reason: data.consultation_reason || null,
                data_complete: data.data_complete || false,
                consent_given: data.consent_given || false,
                consent_given_at: data.consent_given_at || null,
            };

        // Auto-promote to CONSULTATION_SCHEDULED when data is complete
        if (record.data_complete) {
            record.status = 'CONSULTATION_SCHEDULED';
            // Appointment scheduling is handled manually by clinic staff in Gestión Odontológica
        }

        const {error} = await supabase
            .from('patients')
            .upsert(record, {onConflict: 'phone'});

        if (error) log.error('upsertPatient', error);

    } catch (err) {
        log.error('upsertPatient', err);
    }
}

export async function logAccess(endpoint, req) {
    const supabase = getDb();
    const viewer = req.session?.authenticated
        ? 'dashboard_session'
        : req.headers['x-api-key']
            ? `api_key:${req.headers['x-api-key'].slice(0, 6)}`
            : 'unknown';
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
               ?? req.socket?.remoteAddress
               ?? null;
    await supabase.from('access_log').insert({ endpoint, viewer, ip_address: ip });
    // Fire-and-forget — do not throw on failure (audit log must not block the response)
}

export async function deletePatient(phone) {
    const supabase = getDb();
    const { error: errP } = await supabase
        .from('patients')
        .delete()
        .eq('phone', phone);
    if (errP) throw errP;

    const { error: errC } = await supabase
        .from('conversations')
        .delete()
        .eq('phone', phone);
    if (errC) throw errC;

    const { error: errR } = await supabase
        .from('reengagement_queue')
        .delete()
        .eq('phone', phone);
    if (errR) throw errR;
}

export async function getAllPatients() {
    const supabase = getDb();
    try {
        const {data, error} = await supabase
            .from('patients')
            .select('*')
            .order('last_interaction', {ascending: false});

        if (error) log.error('getAllPatients', error);
        return data || [];
    } catch (err) {
        log.error('getAllPatients', err);
        return [];
    }
}

export async function getStats() {
    try {
        const patients = await getAllPatients();
        const total = patients.length;

        const bySource = patients.reduce((acc, p) => {
            acc[p.source] = (acc[p.source] || 0) + 1;
            return acc;
        }, {});

        const byStatus = patients.reduce((acc, p) => {
            acc[p.status] = (acc[p.status] || 0) + 1;
            return acc;
        }, {});

        const byIntent = patients.reduce((acc, p) => {
            acc[p.last_intent] = (acc[p.last_intent] || 0) + 1;
            return acc;
        }, {});

        return {total_leads: total, by_source: bySource, by_status: byStatus, by_intent: byIntent};
    } catch (err) {
        log.error('getStats', err);
        return {total_leads: 0, by_source: {}, by_status: {}, by_intent: {}};
    }
}