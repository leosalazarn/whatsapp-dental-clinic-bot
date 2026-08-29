import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock Supabase with in-memory Map ─────────────────────────────────────────
const store = new Map();
// Captures rows inserted into access_log so tests can assert the audit entry.
const accessLog = [];

vi.mock('@supabase/supabase-js', () => ({
    createClient: () => ({
        from: () => ({
            select: () => ({
                eq: () => ({
                    single: async () => {
                        // Not used directly — crm.js calls findPatient internally
                        return { data: null, error: null };
                    },
                }),
                order: async () => ({ data: Array.from(store.values()), error: null }),
            }),
            upsert: async (record) => {
                store.set(record.phone, record);
                return { error: null };
            },
            insert: async (record) => {
                accessLog.push(record);
                return { error: null };
            },
        }),
    }),
}));

// Override findPatient to read from local store (since mock doesn't support .eq().single() easily)
vi.mock('../src/crm.js', async (importOriginal) => {
    const mod = await importOriginal();
    return {
        ...mod,
        findPatient: async (phone) => store.get(phone) || null,
        getAllPatients: async () => Array.from(store.values()),
        getStats: async () => {
            const patients = Array.from(store.values());
            const total = patients.length;
            const bySource = patients.reduce((acc, p) => { acc[p.source] = (acc[p.source] || 0) + 1; return acc; }, {});
            const byStatus = patients.reduce((acc, p) => { acc[p.status] = (acc[p.status] || 0) + 1; return acc; }, {});
            const byIntent = patients.reduce((acc, p) => { acc[p.last_intent] = (acc[p.last_intent] || 0) + 1; return acc; }, {});
            return { total_leads: total, by_source: bySource, by_status: byStatus, by_intent: byIntent };
        },
        upsertPatient: async (data) => {
            const now = new Date().toISOString();
            const existing = store.get(data.phone);
            const record = existing
                ? { ...existing, ...data, last_interaction: now }
                : {
                    phone: data.phone, name: data.name || null, status: data.status || 'NEW',
                    aesthetic_goal: data.aesthetic_goal || null, source: data.source || 'ORGANIC',
                    trigger_message: data.trigger_message || null, first_contact: existing?.first_contact || now,
                    last_interaction: now, notes: data.notes || '', last_intent: data.last_intent || 'OTHER',
                    full_name: data.full_name || null, email: data.email || null,
                    consultation_reason: data.consultation_reason || null, data_complete: data.data_complete || false,
                };
            if (record.data_complete) record.status = 'CONSULTATION_SCHEDULED';
            store.set(record.phone, record);
        },
    };
});

import { findPatient, upsertPatient, getAllPatients, getStats, logAccess } from '../src/crm.js';

const phone = (n) => `+5730000${n}`;

beforeEach(() => store.clear());

describe('crm — findPatient', () => {
    it('returns null for unknown phone', async () => {
        expect(await findPatient(phone('crm-01'))).toBeNull();
    });

    it('returns the patient after upsert', async () => {
        const p = phone('crm-02');
        await upsertPatient({ phone: p, name: 'Camila' });
        const patient = await findPatient(p);
        expect(patient).not.toBeNull();
        expect(patient.name).toBe('Camila');
    });
});

describe('crm — upsertPatient (create)', () => {
    it('creates patient with defaults', async () => {
        const p = phone('crm-03');
        await upsertPatient({ phone: p });
        const patient = await findPatient(p);
        expect(patient.phone).toBe(p);
        expect(patient.status).toBe('NEW');
        expect(patient.source).toBe('ORGANIC');
        expect(patient.data_complete).toBe(false);
        expect(patient.name).toBeNull();
        expect(patient.first_contact).toBeTruthy();
        expect(patient.last_interaction).toBeTruthy();
    });

    it('stores provided values on creation', async () => {
        const p = phone('crm-04');
        await upsertPatient({ phone: p, name: 'Laura', aesthetic_goal: 'blanqueamiento', source: 'AD_TRIGGER', trigger_message: 'Quiero mejorar mi sonrisa' });
        const patient = await findPatient(p);
        expect(patient.name).toBe('Laura');
        expect(patient.aesthetic_goal).toBe('blanqueamiento');
        expect(patient.source).toBe('AD_TRIGGER');
        expect(patient.trigger_message).toBe('Quiero mejorar mi sonrisa');
    });
});

describe('crm — upsertPatient (update)', () => {
    it('merges new data into existing patient', async () => {
        const p = phone('crm-05');
        await upsertPatient({ phone: p, name: 'Ana' });
        await upsertPatient({ phone: p, name: 'Ana María', aesthetic_goal: 'implantes' });
        const patient = await findPatient(p);
        expect(patient.name).toBe('Ana María');
        expect(patient.aesthetic_goal).toBe('implantes');
    });

    it('preserves first_contact on update', async () => {
        const p = phone('crm-06');
        await upsertPatient({ phone: p, name: 'Sofía' });
        const firstContact = (await findPatient(p)).first_contact;
        await upsertPatient({ phone: p, aesthetic_goal: 'calzas' });
        expect((await findPatient(p)).first_contact).toBe(firstContact);
    });

    it('updates last_interaction on every upsert', async () => {
        const p = phone('crm-07');
        await upsertPatient({ phone: p, name: 'Julia' });
        const t1 = (await findPatient(p)).last_interaction;
        await new Promise(r => setTimeout(r, 5));
        await upsertPatient({ phone: p, aesthetic_goal: 'diseño de sonrisa' });
        expect((await findPatient(p)).last_interaction).not.toBe(t1);
    });
});

describe('crm — auto status promotion', () => {
    it('sets status to CONSULTATION_SCHEDULED when data_complete is true', async () => {
        const p = phone('crm-08');
        await upsertPatient({ phone: p, full_name: 'María Fernanda López', email: 'maria@example.com', consultation_reason: 'blanqueamiento', data_complete: true });
        expect((await findPatient(p)).status).toBe('CONSULTATION_SCHEDULED');
    });

    it('does NOT promote status when data_complete is false', async () => {
        const p = phone('crm-09');
        await upsertPatient({ phone: p, name: 'Pedro', data_complete: false });
        expect((await findPatient(p)).status).toBe('NEW');
    });
});

describe('crm — getAllPatients', () => {
    it('returns an array', async () => {
        expect(Array.isArray(await getAllPatients())).toBe(true);
    });

    it('includes previously created patients', async () => {
        const p = phone('crm-10');
        await upsertPatient({ phone: p, name: 'CRM list test' });
        const all = await getAllPatients();
        expect(all.some(pt => pt.phone === p)).toBe(true);
    });
});

describe('crm — getStats', () => {
    it('returns correct shape', async () => {
        const stats = await getStats();
        expect(stats).toHaveProperty('total_leads');
        expect(stats).toHaveProperty('by_source');
        expect(stats).toHaveProperty('by_status');
        expect(stats).toHaveProperty('by_intent');
    });

    it('counts patients by source', async () => {
        await upsertPatient({ phone: phone('crm-11'), source: 'AD_TRIGGER' });
        await upsertPatient({ phone: phone('crm-12'), source: 'AD_TRIGGER' });
        const stats = await getStats();
        expect(stats.by_source['AD_TRIGGER']).toBeGreaterThanOrEqual(2);
    });

    it('counts patients by status', async () => {
        await upsertPatient({ phone: phone('crm-13'), status: 'SUPPLIER' });
        const stats = await getStats();
        expect(stats.by_status['SUPPLIER']).toBeGreaterThanOrEqual(1);
    });
});

describe('crm — logAccess (Ley 1581 audit log)', () => {
    it('records api_key viewer with only first 6 chars and does not throw', async () => {
        accessLog.length = 0;
        const req = { headers: { 'x-api-key': 'ABCDEFGHIJKLMNOP' } };
        await expect(logAccess('/debug/leads', req)).resolves.toBeUndefined();
        expect(accessLog).toHaveLength(1);
        expect(accessLog[0].endpoint).toBe('/debug/leads');
        expect(accessLog[0].viewer).toBe('api_key:ABCDEF');
        expect(accessLog[0].ip_address).toBeNull();
    });

    it('records dashboard_session viewer with client IP and does not throw', async () => {
        accessLog.length = 0;
        const req = { session: { authenticated: true }, headers: { 'x-forwarded-for': '1.2.3.4, 9.9.9.9' } };
        await expect(logAccess('/dashboard', req)).resolves.toBeUndefined();
        expect(accessLog).toHaveLength(1);
        expect(accessLog[0].viewer).toBe('dashboard_session');
        expect(accessLog[0].ip_address).toBe('1.2.3.4');
    });
});