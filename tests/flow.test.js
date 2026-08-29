import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock external I/O modules before any other imports
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
    callValeria: vi.fn().mockResolvedValue({ text: 'Hola! ¿Cómo te llamas?\nNAME: test', input_tokens: 50, output_tokens: 100 }),
}));

vi.mock('../src/whatsapp.js', () => ({
    sendMessage: vi.fn().mockResolvedValue(undefined),
    sendInteractiveButtons: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/reengagement.js', () => ({
    scheduleReengagement: vi.fn().mockResolvedValue(undefined),
    cancelReengagement: vi.fn().mockResolvedValue(undefined),
    startReengagementPoller: vi.fn(),
    stopReengagementPoller: vi.fn(),
}));

// Mock CRM so findPatient can be controlled per-test (returning-patient consent bypass)
vi.mock('../src/crm.js', () => ({
    upsertPatient: vi.fn().mockResolvedValue(undefined),
    findPatient: vi.fn().mockResolvedValue(null),
}));

import { processMessage, handleConversionFlow, stripSignals } from '../src/flow.js';
import { POSITIVE_RESPONSES, MSG_CONSENT, MSG_CONSENT_DECLINED, CONSENT_AFFIRMATIVE, CONSENT_BUTTONS } from '../src/config.js';
import { sendMessage, sendInteractiveButtons } from '../src/whatsapp.js';
import { callValeria } from '../src/ai.js';
import { updateSession, getSession } from '../src/session.js';
import { findPatient } from '../src/crm.js';

const phone = (n) => `+5734000${n}`;

beforeEach(() => {
    vi.clearAllMocks();
});

// ─── stripSignals ────────────────────────────────────────────────────────────

describe('stripSignals', () => {
    it('removes NAME signal line', () => {
        expect(stripSignals('Hola!\nNAME: Carolina')).toBe('Hola!');
    });

    it('removes GOAL signal line', () => {
        expect(stripSignals('Entendido!\nGOAL: blanqueamiento')).toBe('Entendido!');
    });

    it('removes EXTRACTED signal line', () => {
        const text = 'Listo 😊\nEXTRACTED: full_name: María, email: m@m.com, consultation_reason: implantes';
        expect(stripSignals(text)).toBe('Listo 😊');
    });

    it('removes multiple signal lines at once', () => {
        const text = 'Texto visible\nNAME: Ana\nGOAL: calzas\nEXTRACTED: full_name: Ana Ruiz, email: a@b.com, consultation_reason: calzas';
        expect(stripSignals(text)).toBe('Texto visible');
    });

    it('leaves clean text untouched', () => {
        const text = '¡Claro! Te puedo ayudar con eso 😊';
        expect(stripSignals(text)).toBe(text);
    });
});

// ─── POSITIVE_RESPONSES ──────────────────────────────────────────────────────

describe('POSITIVE_RESPONSES', () => {
    it('is a non-empty array', () => {
        expect(Array.isArray(POSITIVE_RESPONSES)).toBe(true);
        expect(POSITIVE_RESPONSES.length).toBeGreaterThan(0);
    });

    it('contains core affirmative words', () => {
        expect(POSITIVE_RESPONSES).toContain('sí');
        expect(POSITIVE_RESPONSES).toContain('si');
        expect(POSITIVE_RESPONSES).toContain('ok');
        expect(POSITIVE_RESPONSES).toContain('dale');
        expect(POSITIVE_RESPONSES).toContain('agendar');
    });
});

// ─── processMessage — IGNORE ─────────────────────────────────────────────────

describe('processMessage — IGNORE classification', () => {
    it('does nothing for a group message', async () => {
        await processMessage(phone('f-01'), 'Hola a todos', 'group');
        expect(sendMessage).not.toHaveBeenCalled();
        expect(callValeria).not.toHaveBeenCalled();
    });

    it('does NOT send consent at START — new individual contact advances to EXTRACTION and AI handles normally', async () => {
        const p = phone('f-02');
        await processMessage(p, 'Hola, buenos días', 'individual');
        expect(callValeria).toHaveBeenCalled();
        expect(sendMessage).toHaveBeenCalled();
        expect(sendMessage).not.toHaveBeenCalledWith(expect.any(String), MSG_CONSENT);
    });
});

// ─── processMessage — WARM_LEAD / EXTRACTION phase ───────────────────────────

describe('processMessage — EXTRACTION phase (warm lead)', () => {
    it('calls Claude and sends AI response when name is unknown (post-consent EXTRACTION)', async () => {
        const p = phone('f-04');
        await updateSession(p, { phase: 'EXTRACTION', source: 'DIRECT' });
        await processMessage(p, 'Quiero mejorar mi sonrisa', 'individual');
        expect(callValeria).toHaveBeenCalledOnce();
        expect(sendMessage).toHaveBeenCalledOnce();
    });

    it('strips signals before sending to patient', async () => {
        const p = phone('f-05');
        callValeria.mockResolvedValueOnce({ text: '¿Cómo te llamas?\nNAME: Sofía\nGOAL: blanqueamiento', input_tokens: 50, output_tokens: 100 });
        await updateSession(p, { phase: 'EXTRACTION', source: 'DIRECT' });
        await processMessage(p, 'Quiero información', 'individual');
        const sentText = vi.mocked(sendMessage).mock.calls[0][1];
        expect(sentText).not.toContain('NAME:');
        expect(sentText).not.toContain('GOAL:');
        expect(sentText).toContain('¿Cómo te llamas?');
    });
});

// ─── processMessage — HOOK phase ─────────────────────────────────────────────

describe('processMessage — HOOK phase', () => {
    it('sends hardcoded hook message when name + goal are available after EXTRACTION', async () => {
        const p = phone('f-06');
        await updateSession(p, { name: 'Laura', aesthetic_goal: 'diseño de sonrisa', phase: 'EXTRACTION', source: 'DIRECT' });

        await processMessage(p, 'Sí, me interesa', 'individual');

        expect(callValeria).toHaveBeenCalled();
        expect(sendMessage).toHaveBeenCalledOnce();
        const sentText = vi.mocked(sendMessage).mock.calls[0][1];
        expect(sentText).toContain('Hola! ¿Cómo te llamas?');
        expect(sentText).toContain('Hola! ¿Cómo te llamas?');
    });

    it('transitions session phase to HOOK', async () => {
        const p = phone('f-07');
        await updateSession(p, { name: 'Juliana', aesthetic_goal: 'calzas', phase: 'EXTRACTION', source: 'DIRECT' });
        await processMessage(p, 'Bueno', 'individual');
        expect((await getSession(p)).phase).toBe('EXTRACTION');
    });

    it('CONSENT entry returns an interactive_buttons object (not a plain string)', async () => {
        const p = phone('c-obj');
        findPatient.mockResolvedValue({ phone: p, consent_given: false });
        await updateSession(p, { name: 'Lucía', aesthetic_goal: 'carillas', phase: 'HOOK', source: 'DIRECT' });

        const result = await handleConversionFlow(p, await getSession(p), 'sí, agendemos');

        expect(typeof result).not.toBe('string');
        expect(result).toEqual({ kind: 'interactive_buttons', body: MSG_CONSENT, buttons: CONSENT_BUTTONS });
        expect((await getSession(p)).phase).toBe('CONSENT');
    });

    it("CONSENT phase: button reply 'consent_yes' advances to DATA_CAPTURE", async () => {
        const p = phone('c-yes');
        await updateSession(p, { phase: 'CONSENT', source: 'DIRECT' });

        const result = await handleConversionFlow(p, await getSession(p), 'consent_yes');

        expect(result).toBeNull();
        const s = await getSession(p);
        expect(s.phase).toBe('DATA_CAPTURE');
        expect(s.consent_given).toBe(true);
        expect(s.consent_given_at).not.toBeNull();
    });

    it("CONSENT phase: button reply 'consent_no' returns the refusal message", async () => {
        const p = phone('c-no');
        await updateSession(p, { phase: 'CONSENT', source: 'DIRECT' });

        const result = await handleConversionFlow(p, await getSession(p), 'consent_no');

        expect(result).toBe(MSG_CONSENT_DECLINED);
        expect((await getSession(p)).phase).toBe('CONSENT');
    });

    it('CONSENT phase: unknown free text re-sends the buttons (not refusal)', async () => {
        const p = phone('c-free');
        await updateSession(p, { phase: 'CONSENT', source: 'DIRECT' });

        const result = await handleConversionFlow(p, await getSession(p), 'no estoy seguro');

        expect(result).toEqual({ kind: 'interactive_buttons', body: MSG_CONSENT, buttons: CONSENT_BUTTONS });
        expect((await getSession(p)).phase).toBe('CONSENT');
    });

    it('CONSENT phase: plain CONSENT_AFFIRMATIVE keyword advances to DATA_CAPTURE (fallback preserved)', async () => {
        const p = phone('c-affirm');
        await updateSession(p, { phase: 'CONSENT', source: 'DIRECT' });

        const result = await handleConversionFlow(p, await getSession(p), 'claro, autorizo');

        expect(result).toBeNull();
        const s = await getSession(p);
        expect(s.phase).toBe('DATA_CAPTURE');
        expect(s.consent_given).toBe(true);
    });
});

// ─── processMessage — DATA_CAPTURE phase ─────────────────────────────────────

describe('processMessage — DATA_CAPTURE phase', () => {
    it('sends data capture request on positive response to HOOK', async () => {
        const p = phone('f-08');
        findPatient.mockResolvedValue({ phone: p, consent_given: true });
        await updateSession(p, { name: 'Mariela', aesthetic_goal: 'implantes', phase: 'HOOK', source: 'DIRECT' });

        await processMessage(p, 'sí, quiero agendar', 'individual');

        expect(callValeria).not.toHaveBeenCalled();
        expect(sendMessage).toHaveBeenCalledOnce();
        const sentText = vi.mocked(sendMessage).mock.calls[0][1];
        expect(sentText).toContain('Nombre completo');
        expect(sentText).toContain('Correo electrónico');
    });

    it('transitions session phase to DATA_CAPTURE', async () => {
        const p = phone('f-09');
        findPatient.mockResolvedValue({ phone: p, consent_given: true });
        await updateSession(p, { name: 'Carmen', aesthetic_goal: 'blanqueamiento', phase: 'HOOK', source: 'ORGANIC' });
        await processMessage(p, 'dale', 'individual');
        expect((await getSession(p)).phase).toBe('DATA_CAPTURE');
    });

    it('does NOT trigger DATA_CAPTURE on negative/neutral response', async () => {
        const p = phone('f-10');
        callValeria.mockResolvedValueOnce({ text: 'Entiendo, sin problema. ¿Hay algo más?', input_tokens: 50, output_tokens: 100 });
        await updateSession(p, { name: 'Tania', aesthetic_goal: 'blanqueamiento', phase: 'HOOK', source: 'DIRECT' });
        await processMessage(p, 'Ahora no puedo', 'individual');
        expect(callValeria).toHaveBeenCalledOnce();
    });
});

// ─── processMessage — CONSENT phase (Ley 1581) ─────────────────────────────

describe('processMessage — CONSENT gate (Ley 1581, at DATA_CAPTURE entry)', () => {
    it('requests consent (no AI) as interactive buttons and sets CONSENT phase when entering DATA_CAPTURE without prior consent', async () => {
        const p = phone('c-01');
        findPatient.mockResolvedValue({ phone: p, consent_given: false });
        await updateSession(p, { name: 'Lucía', aesthetic_goal: 'carillas', phase: 'HOOK', source: 'DIRECT' });

        await processMessage(p, 'sí, quiero agendar', 'individual');

        expect(callValeria).not.toHaveBeenCalled();
        expect(sendInteractiveButtons).toHaveBeenCalledOnce();
        const [sentPhone, sentBody, sentButtons] = vi.mocked(sendInteractiveButtons).mock.calls[0];
        expect(sentPhone).toBe(p);
        expect(sentBody).toBe(MSG_CONSENT);
        expect(sentButtons).toEqual(CONSENT_BUTTONS);
        expect(sendMessage).not.toHaveBeenCalled();
        expect((await getSession(p)).phase).toBe('CONSENT');
    });

    it('grants consent and advances to DATA_CAPTURE (not EXTRACTION) on an affirmative reply', async () => {
        const p = phone('c-02');
        await updateSession(p, { phase: 'CONSENT', source: 'DIRECT' });

        await processMessage(p, 'sí, autorizo', 'individual');

        // AI handles this turn normally once consent is granted
        expect(callValeria).toHaveBeenCalledOnce();
        const s = await getSession(p);
        expect(s.phase).toBe('DATA_CAPTURE');
        expect(s.consent_given).toBe(true);
        expect(s.consent_given_at).not.toBeNull();
    });

    it('full chain: HOOK positive → no consent → MSG_CONSENT → affirmative → advances to DATA_CAPTURE', async () => {
        const p = phone('c-chain');
        findPatient.mockResolvedValue({ phone: p, consent_given: false });
        await updateSession(p, { name: 'Andrés', aesthetic_goal: 'implantes', phase: 'HOOK', source: 'DIRECT' });

        // Step 1: positive hook response with no consent on record → consent request (interactive buttons)
        await processMessage(p, 'sí, agendemos', 'individual');
        expect(vi.mocked(sendInteractiveButtons).mock.calls[0][1]).toBe(MSG_CONSENT);
        expect((await getSession(p)).phase).toBe('CONSENT');

        // Step 2: affirmative reply → consent granted, advance to DATA_CAPTURE
        vi.clearAllMocks();
        await processMessage(p, 'sí, autorizo', 'individual');
        const s = await getSession(p);
        expect(s.phase).toBe('DATA_CAPTURE');
        expect(s.consent_given).toBe(true);
    });

    it('skips the consent gate when consent already on record → advances straight to DATA_CAPTURE', async () => {
        const p = phone('c-05');
        findPatient.mockResolvedValue({ phone: p, consent_given: true });
        await updateSession(p, { name: 'Marta', aesthetic_goal: 'blanqueamiento', phase: 'HOOK', source: 'DIRECT' });

        await processMessage(p, 'dale, agendar', 'individual');

        expect(callValeria).not.toHaveBeenCalled();
        expect(sendMessage).toHaveBeenCalledOnce();
        const sentText = vi.mocked(sendMessage).mock.calls[0][1];
        expect(sentText).not.toBe(MSG_CONSENT);
        expect(sentText).toContain('Nombre completo');
        expect((await getSession(p)).phase).toBe('DATA_CAPTURE');
    });

    it('stays in CONSENT on an explicit button refusal (AI not called)', async () => {
        const p = phone('c-03');
        await updateSession(p, { phase: 'CONSENT', source: 'DIRECT' });

        await processMessage(p, 'consent_no', 'individual');

        expect(callValeria).not.toHaveBeenCalled();
        expect(sendMessage).toHaveBeenCalledOnce();
        const sentText = vi.mocked(sendMessage).mock.calls[0][1];
        expect(sentText).toBe(MSG_CONSENT_DECLINED);
        expect(sendInteractiveButtons).not.toHaveBeenCalled();
        expect((await getSession(p)).phase).toBe('CONSENT');
    });

    it('considers every CONSENT_AFFIRMATIVE keyword an affirmative', () => {
        expect(Array.isArray(CONSENT_AFFIRMATIVE)).toBe(true);
        for (const word of ['sí', 'si', 'claro', 'acepto', 'ok', 'dale', 'listo', 'por supuesto', 'autorizo', 'yes']) {
            expect(CONSENT_AFFIRMATIVE).toContain(word);
        }
    });

    it('skips consent for a returning patient who already granted consent (DB consent_given = true)', async () => {
        const p = phone('c-04');
        findPatient.mockResolvedValue({ phone: p, consent_given: true });

        await processMessage(p, 'Hola de nuevo', 'individual');

        expect(callValeria).toHaveBeenCalledOnce();
        expect(sendMessage).not.toHaveBeenCalledWith(expect.any(String), MSG_CONSENT);
        expect((await getSession(p)).phase).toBe('EXTRACTION');
    });
});