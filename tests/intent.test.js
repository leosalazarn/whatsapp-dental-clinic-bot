import { describe, it, expect, vi } from 'vitest';

// ── In-memory CRM mock (no Supabase in tests) ────────────────────────────────
const store = new Map();
vi.mock('../src/crm.js', () => ({
    findPatient: async (phone) => store.get(phone) || null,
    upsertPatient: async (data) => {
        const now = new Date().toISOString();
        const existing = store.get(data.phone);
        const record = existing
            ? { ...existing, ...data, last_interaction: now }
            : { status: 'NEW', source: 'ORGANIC', data_complete: false, ...data, first_contact: now, last_interaction: now };
        if (record.data_complete) record.status = 'CONSULTATION_SCHEDULED';
        store.set(record.phone, record);
    },
    getAllPatients: async () => Array.from(store.values()),
    getStats: async () => ({}),
}));

import { extractIntent } from '../src/intent.js';
import { findPatient } from '../src/crm.js';

const phone = (n) => `+5733000${n}`;
const baseSession = { name: null, aesthetic_goal: null, source: 'ORGANIC', phase: 'EXTRACTION' };

describe('intent — NAME signal extraction', () => {
    it('extracts name from AI response signal', () => {
        const p = phone('i-01');
        const intent = extractIntent(p, 'Hola! ¿Cómo te puedo ayudar?\nNAME: Carolina', baseSession);
        expect(intent.name).toBe('Carolina');
    });

    it('trims whitespace from extracted name', () => {
        const p = phone('i-02');
        const intent = extractIntent(p, 'Claro!\nNAME:   Andrés   ', baseSession);
        expect(intent.name).toBe('Andrés');
    });

    it('falls back to session.name when no NAME signal', () => {
        const p = phone('i-03');
        const session = { ...baseSession, name: 'Carlos' };
        const intent = extractIntent(p, 'Gracias por escribir!', session);
        expect(intent.name).toBe('Carlos');
    });
});

describe('intent — GOAL signal extraction', () => {
    it('extracts aesthetic goal from AI response signal', () => {
        const p = phone('i-04');
        const intent = extractIntent(p, 'Entendido!\nGOAL: diseño de sonrisa', baseSession);
        expect(intent.aesthetic_goal).toBe('diseño de sonrisa');
    });

    it('falls back to session.aesthetic_goal when no GOAL signal', () => {
        const p = phone('i-05');
        const session = { ...baseSession, aesthetic_goal: 'blanqueamiento' };
        const intent = extractIntent(p, 'Perfecto!', session);
        expect(intent.aesthetic_goal).toBe('blanqueamiento');
    });
});

describe('intent — intent detection', () => {
    it('detects SCHEDULE intent when response mentions "agendar"', () => {
        const p = phone('i-06');
        const intent = extractIntent(p, 'Podemos agendar para esta semana', baseSession);
        expect(intent.intent).toBe('SCHEDULE');
        expect(intent.requires_human).toBe(true);
    });

    it('detects PRICE_OBJECTION intent', () => {
        const p = phone('i-07');
        const intent = extractIntent(p, '¿Cuánto cuesta el precio del blanqueamiento?', baseSession);
        expect(intent.intent).toBe('PRICE_OBJECTION');
    });

    it('detects FEAR_OBJECTION intent', () => {
        const p = phone('i-08');
        const intent = extractIntent(p, 'Tengo miedo al dolor en el consultorio', baseSession);
        expect(intent.intent).toBe('FEAR_OBJECTION');
    });

    it('detects UNDECIDED intent', () => {
        const p = phone('i-09');
        const intent = extractIntent(p, 'Voy a pienso bien antes de decidir', baseSession);
        expect(intent.intent).toBe('UNDECIDED');
    });

    it('detects REQUEST_INFO intent', () => {
        const p = phone('i-10');
        const intent = extractIntent(p, 'Quisiera más información sobre el tratamiento', baseSession);
        expect(intent.intent).toBe('REQUEST_INFO');
    });

    it('defaults to OTHER when no keyword matches', () => {
        const p = phone('i-11');
        const intent = extractIntent(p, 'Gracias, hasta luego!', baseSession);
        expect(intent.intent).toBe('OTHER');
    });
});

describe('intent — EXTRACTED signal (DATA_CAPTURE phase)', () => {
    const dataCaptureSession = { ...baseSession, phase: 'DATA_CAPTURE' };

    it('parses full_name, email and consultation_reason from EXTRACTED signal', () => {
        const p = phone('i-12');
        const response = 'Listo, lo tengo todo anotado 😊\nEXTRACTED: full_name: María López, email: maria@mail.com, consultation_reason: diseño de sonrisa';
        const intent = extractIntent(p, response, dataCaptureSession);
        expect(intent.full_name).toBe('María López');
        expect(intent.email).toBe('maria@mail.com');
        expect(intent.consultation_reason).toBe('diseño de sonrisa');
        expect(intent.data_complete).toBe(true);
    });

    it('does NOT set data_complete when EXTRACTED is absent', () => {
        const p = phone('i-13');
        const intent = extractIntent(p, 'Cuéntame tu nombre completo', dataCaptureSession);
        expect(intent.data_complete).toBeUndefined();
    });
});

describe('intent — CRM update side effect', () => {
    it('creates or updates patient in CRM after extraction', async () => {
        const p = phone('i-14');
        extractIntent(p, 'Hola!\nNAME: Valentina\nGOAL: implantes', { ...baseSession, name: null });
        await new Promise(r => setTimeout(r, 50));
        const patient = await findPatient(p);
        expect(patient).not.toBeNull();
        expect(patient.name).toBe('Valentina');
        expect(patient.aesthetic_goal).toBe('implantes');
    });

    it('sets status to CONSULTATION_SCHEDULED in CLOSING phase', async () => {
        const p = phone('i-15');
        const closingSession = { ...baseSession, phase: 'CLOSING', name: 'Coco' };
        extractIntent(p, 'Tu cita está confirmada!', closingSession);
        await new Promise(r => setTimeout(r, 50));
        const patient = await findPatient(p);
        expect(patient?.status).toBe('CONSULTATION_SCHEDULED');
    });
});