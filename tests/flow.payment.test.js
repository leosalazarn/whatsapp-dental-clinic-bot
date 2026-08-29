import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock external I/O modules before any other imports (mirrors tests/flow.test.js)
vi.mock('@supabase/supabase-js', () => ({
    createClient: vi.fn(() => ({
        from: vi.fn(() => ({
            select: vi.fn(() => ({
                eq: vi.fn(() => ({
                    single: vi.fn(() => Promise.resolve({ data: null, error: { code: 'PGRST116' } }))
                })),
                order: vi.fn(() => ({
                    ascending: vi.fn(() => Promise.resolve({ data: [], error: null }))
                }))
            })),
            upsert: vi.fn(() => Promise.resolve({ error: null }))
        }))
    }))
}));

vi.mock('../src/ai.js', () => ({
    callValeria: vi.fn().mockResolvedValue({ text: 'Hola!', input_tokens: 50, output_tokens: 100 }),
}));

vi.mock('../src/whatsapp.js', () => ({
    sendMessage: vi.fn().mockResolvedValue(undefined),
    sendInteractiveButtons: vi.fn().mockResolvedValue(undefined),
    sendReceptionistAlert: vi.fn().mockResolvedValue(undefined),
    notifyReceptionist: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/reengagement.js', () => ({
    scheduleReengagement: vi.fn().mockResolvedValue(undefined),
    cancelReengagement: vi.fn().mockResolvedValue(undefined),
    startReengagementPoller: vi.fn(),
    stopReengagementPoller: vi.fn(),
}));

import { processMessage, handleConversionFlow } from '../src/flow.js';
import { callValeria } from '../src/ai.js';
import { sendMessage, sendReceptionistAlert, notifyReceptionist } from '../src/whatsapp.js';
import { updateSession, getSession } from '../src/session.js';
import { MOBILE_WALLET_NUMBER, BANK_ACCOUNT_1, MSG_CLOSING, MSG_CLOSING_IN_PERSON, MSG_PAYMENT, MSG_RECEPTIONIST_COMPROBANTE, MSG_RECEPTIONIST_IN_PERSON } from '../src/config.js';

const phone = (n) => `+5734000${n}`;

beforeEach(() => {
    vi.clearAllMocks();
});

// ─── handleConversionFlow — PAYMENT phase ─────────────────────────────────────

describe('handleConversionFlow — PAYMENT phase (deterministic)', () => {
    it('returns the hardcoded payment template (no AI) when payment_info_sent is false', async () => {
        const p = phone('p-01');
        await updateSession(p, { name: 'Ana', aesthetic_goal: 'implantes', phase: 'PAYMENT', payment_info_sent: false });

        const result = await handleConversionFlow(p, await getSession(p));

        expect(typeof result).toBe('string');
        expect(result).toContain(MOBILE_WALLET_NUMBER);
        expect(result).toContain(BANK_ACCOUNT_1);
        expect(callValeria).not.toHaveBeenCalled();
    });

    it('advances to CLOSING and returns the deterministic closing message (not null) when payment_info_sent is true', async () => {
        const p = phone('p-02');
        await updateSession(p, { name: 'Ana', aesthetic_goal: 'implantes', phase: 'PAYMENT', payment_info_sent: true });

        const result = await handleConversionFlow(p, await getSession(p));

        expect(typeof result).toBe('string');
        expect(result).toBe(MSG_CLOSING('Ana'));
        expect(result).not.toMatch(/martes|lunes|\d{1,2}\s?pm|3pm/i);
        expect((await getSession(p)).phase).toBe('CLOSING');
    });

    it('returns a CLOSING message that matches the MSG_CLOSING pattern and never invents a date', async () => {
        const p = phone('p-04');
        await updateSession(p, { name: 'Carlos', aesthetic_goal: 'calzas', phase: 'PAYMENT', payment_info_sent: true });

        const result = await handleConversionFlow(p, await getSession(p));

        expect(result).toContain('Carlos');
        expect(result).toContain('Ya casi');
        expect(result).not.toMatch(/agendamos para el (lunes|martes|miércoles|jueves|viernes|sábado|domingo)/i);
    });
});

describe('handleConversionFlow — PAYMENT phase (receptionist handoff)', () => {
    it('notifies the receptionist on first-touch PAYMENT with the captured lead data', async () => {
        const p = phone('rh-1');
        await updateSession(p, { name: 'Ana', aesthetic_goal: 'implantes', phase: 'PAYMENT', payment_info_sent: false });

        await handleConversionFlow(p, await getSession(p));

        expect(sendReceptionistAlert).toHaveBeenCalledOnce();
        expect(sendReceptionistAlert).toHaveBeenCalledWith('Ana', 'implantes', p);
    });

    it('does NOT notify the receptionist on a follow-up PAYMENT message', async () => {
        const p = phone('rh-2');
        await updateSession(p, { name: 'Ana', aesthetic_goal: 'implantes', phase: 'PAYMENT', payment_info_sent: true });

        await handleConversionFlow(p, await getSession(p), 'gracias');

        expect(sendReceptionistAlert).not.toHaveBeenCalled();
    });
});

// ─── handleConversionFlow — PAYMENT phase signal tokens ──────────────────────

describe('handleConversionFlow — PAYMENT phase signal tokens', () => {
    it('PAYMENT + [IN_PERSON_PAYMENT] in AI response → returns MSG_CLOSING_IN_PERSON and advances to CLOSING', async () => {
        const p = phone('tok-ip');
        await updateSession(p, { name: 'Ana', aesthetic_goal: 'implantes', phase: 'PAYMENT', payment_info_sent: true });
        vi.mocked(callValeria).mockResolvedValueOnce({ text: 'Entiendo, entonces [IN_PERSON_PAYMENT]', input_tokens: 1, output_tokens: 1 });

        const result = await handleConversionFlow(p, await getSession(p), 'no puedo transferir');

        expect(result).toBe(MSG_CLOSING_IN_PERSON('Ana'));
        expect(result).not.toContain('[IN_PERSON_PAYMENT]');
        const s = await getSession(p);
        expect(s.phase).toBe('CLOSING');
        expect(s.in_person_payment).toBe(true);
    });

    it('PAYMENT + [RESENT_DATA] in AI response → returns MSG_PAYMENT and leaves phase unchanged', async () => {
        const p = phone('tok-rs');
        await updateSession(p, { name: 'Ana', aesthetic_goal: 'implantes', phase: 'PAYMENT', payment_info_sent: true });
        vi.mocked(callValeria).mockResolvedValueOnce({ text: 'Claro, te reenvío [RESENT_DATA]', input_tokens: 1, output_tokens: 1 });

        const result = await handleConversionFlow(p, await getSession(p), 'reenvíame los datos');

        expect(result).toBe(MSG_PAYMENT());
        expect(result).toContain(MOBILE_WALLET_NUMBER);
        expect((await getSession(p)).phase).toBe('PAYMENT');
    });

    it('PAYMENT with no token → normal flow: advances to CLOSING via MSG_CLOSING', async () => {
        const p = phone('tok-none');
        await updateSession(p, { name: 'Ana', aesthetic_goal: 'implantes', phase: 'PAYMENT', payment_info_sent: true });

        const result = await handleConversionFlow(p, await getSession(p), 'gracias');

        expect(result).toBe(MSG_CLOSING('Ana'));
        expect((await getSession(p)).phase).toBe('CLOSING');
    });

    it('does NOT trigger the in-person path on a non-signal first-touch message — normal PAYMENT flow proceeds', async () => {
        const p = phone('ip-3');
        await updateSession(p, { name: 'Ana', aesthetic_goal: 'implantes', phase: 'PAYMENT', payment_info_sent: false });

        const result = await handleConversionFlow(p, await getSession(p), 'ya pagué');

        expect(result).not.toBe(MSG_CLOSING_IN_PERSON('Ana'));
        expect(result).toContain(MOBILE_WALLET_NUMBER);
        expect((await getSession(p)).payment_in_person).not.toBe(true);
    });
});

describe('handleConversionFlow — PAYMENT phase comprobante + in-person alerts', () => {
    it('[COMPROBANTE_SENT] text → returns confirmation and alerts receptionist with MSG_RECEPTIONIST_COMPROBANTE', async () => {
        const p = phone('comp-1');
        await updateSession(p, { name: 'Ana', aesthetic_goal: 'implantes', phase: 'PAYMENT', payment_info_sent: true });

        const result = await handleConversionFlow(p, await getSession(p), '[COMPROBANTE_SENT]');

        expect(result).toContain('Recibimos tu comprobante');
        expect(notifyReceptionist).toHaveBeenCalledOnce();
        expect(notifyReceptionist).toHaveBeenCalledWith(MSG_RECEPTIONIST_COMPROBANTE('Ana', p));
        expect(callValeria).not.toHaveBeenCalled();
    });

    it('[IN_PERSON_PAYMENT] → alerts receptionist with MSG_RECEPTIONIST_IN_PERSON', async () => {
        const p = phone('comp-2');
        await updateSession(p, { name: 'Ana', aesthetic_goal: 'implantes', phase: 'PAYMENT', payment_info_sent: true });
        vi.mocked(callValeria).mockResolvedValueOnce({ text: 'Entiendo, entonces [IN_PERSON_PAYMENT]', input_tokens: 1, output_tokens: 1 });

        const result = await handleConversionFlow(p, await getSession(p), 'no puedo transferir');

        expect(result).toBe(MSG_CLOSING_IN_PERSON('Ana'));
        expect(notifyReceptionist).toHaveBeenCalledOnce();
        expect(notifyReceptionist).toHaveBeenCalledWith(MSG_RECEPTIONIST_IN_PERSON('Ana', p));
    });
});

// ─── processMessage — CLOSING phase signal token ──────────────────────────────

describe('processMessage — CLOSING phase signal token', () => {
    it('CLOSING + [RESENT_DATA] in AI response → sends MSG_PAYMENT and leaves phase unchanged', async () => {
        const p = phone('cl-rs');
        await updateSession(p, { name: 'Ana', aesthetic_goal: 'implantes', phase: 'CLOSING', payment_info_sent: true });
        vi.mocked(callValeria).mockResolvedValueOnce({ text: 'Claro, te reenvío [RESENT_DATA]', input_tokens: 1, output_tokens: 1 });

        await processMessage(p, 'reenvíame los datos', 'individual');

        expect(sendMessage).toHaveBeenCalled();
        const sent = vi.mocked(sendMessage).mock.calls[0][1];
        expect(sent).toBe(MSG_PAYMENT());
        expect(sent).toContain(MOBILE_WALLET_NUMBER);
        expect((await getSession(p)).phase).toBe('CLOSING');
    });
});

// ─── processMessage — PAYMENT phase (integration) ────────────────────────────

describe('processMessage — PAYMENT phase', () => {
    it('sends the hardcoded payment info and never calls the AI', async () => {
        const p = phone('p-03');
        await updateSession(p, { name: 'Ana', aesthetic_goal: 'implantes', phase: 'PAYMENT', payment_info_sent: false });

        await processMessage(p, 'sí', 'individual');

        expect(callValeria).not.toHaveBeenCalled();
        expect(sendMessage).toHaveBeenCalledOnce();
        const sent = vi.mocked(sendMessage).mock.calls[0][1];
        expect(sent).toContain(MOBILE_WALLET_NUMBER);
        expect(sent).toContain(BANK_ACCOUNT_1);
    });
});
