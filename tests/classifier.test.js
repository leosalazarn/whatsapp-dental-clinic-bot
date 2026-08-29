import { describe, it, expect, vi } from 'vitest';

// Mock Supabase client
vi.mock('@supabase/supabase-js', () => ({
    createClient: vi.fn(() => ({
        from: vi.fn(() => ({
            select: vi.fn(() => ({
                eq: vi.fn(() => ({
                    single: vi.fn(() => Promise.resolve({ data: null, error: { code: 'PGRST116' } }))
                }))
            })),
            upsert: vi.fn(() => Promise.resolve({ error: null }))
        }))
    }))
}));

// ── In-memory CRM mock (no Supabase in tests) ────────────────────────────────
const store = new Map();
vi.mock('../src/crm.js', () => ({
    findPatient: async (phone) => store.get(phone) || null,
    upsertPatient: async (data) => {
        const now = new Date().toISOString();
        const existing = store.get(data.phone);
        store.set(data.phone, existing
            ? { ...existing, ...data, last_interaction: now }
            : { status: 'NEW', source: 'ORGANIC', data_complete: false, ...data, first_contact: now, last_interaction: now }
        );
    },
    getAllPatients: async () => Array.from(store.values()),
    getStats: async () => ({}),
}));

import { classifyMessage } from '../src/classifier.js';
import { upsertPatient } from '../src/crm.js';
import { updateSession } from '../src/session.js';

const phone = (n) => `+5732000${n}`;

describe('classifier — Rule 1: group messages', () => {
    it('returns IGNORE for any group message', async () => {
        const result = await classifyMessage(phone('c-01'), 'Hola a todos', 'group');
        expect(result.action).toBe('IGNORE');
        expect(result.reason).toBe('group_message');
    });

    it('ignores any message if sent from a group', async () => {
        const result = await classifyMessage(phone('c-02'), 'Quiero agendar', 'group');
        expect(result.action).toBe('IGNORE');
    });
});

describe('classifier — Rule 2: in-treatment patient', () => {
    it('returns CURRENT_PATIENT for a phone with status IN_TREATMENT', async () => {
        const p = phone('c-03');
        upsertPatient({ phone: p, status: 'IN_TREATMENT' });
        const result = await classifyMessage(p, 'Tengo una duda', 'individual');
        expect(result.action).toBe('CURRENT_PATIENT');
        expect(result.reason).toBe('in_treatment');
    });

    it('does NOT return CURRENT_PATIENT for PROSPECT status', async () => {
        const p = phone('c-04');
        upsertPatient({ phone: p, status: 'PROSPECT' });
        const result = await classifyMessage(p, 'Una pregunta', 'individual');
        expect(result.action).not.toBe('CURRENT_PATIENT');
    });
});

describe('classifier — Rule 3: active session (organic lead)', () => {
    it('returns ORGANIC_LEAD when session phase is not START', async () => {
        const p = phone('c-05');
        await updateSession(p, { phase: 'EXTRACTION' });
        const result = await classifyMessage(p, 'Quiero hacerme los dientes', 'individual');
        expect(result.action).toBe('ORGANIC_LEAD');
        expect(result.source).toBe('ORGANIC');
    });

    it('does NOT return ORGANIC_LEAD when phase is START', async () => {
        const p = phone('c-06');
        await updateSession(p, { phase: 'START' });
        const result = await classifyMessage(p, 'Una pregunta', 'individual');
        expect(result.action).not.toBe('ORGANIC_LEAD');
    });
});

describe('classifier — Rule 4: new contact (warm lead)', () => {
    it('returns WARM_LEAD for any new individual contact', async () => {
        const result = await classifyMessage(phone('c-07'), 'Hola buenos días', 'individual');
        expect(result.action).toBe('WARM_LEAD');
        expect(result.source).toBe('DIRECT');
    });

    it('returns WARM_LEAD even for unrelated messages', async () => {
        const result = await classifyMessage(phone('c-08'), 'Le envío la factura del pedido', 'individual');
        expect(result.action).toBe('WARM_LEAD');
    });

    it('returns WARM_LEAD for price questions', async () => {
        const result = await classifyMessage(phone('c-09'), 'Que precio tiene?', 'individual');
        expect(result.action).toBe('WARM_LEAD');
    });
});