import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendInteractiveButtons, sendReceptionistAlert, notifyReceptionist } from '../src/whatsapp.js';

const fetchMock = vi.fn();

describe('sendInteractiveButtons', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        global.fetch = fetchMock;
        fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    });

    it('builds the correct Meta interactive button payload', async () => {
        const buttons = [
            { id: 'consent_yes', title: '✅ Sí, autorizo' },
            { id: 'consent_no', title: '❌ No, gracias' },
        ];
        await sendInteractiveButtons('+5730000000', '¿Autorizas?', buttons);

        expect(fetchMock).toHaveBeenCalledOnce();
        const [url, opts] = fetchMock.mock.calls[0];
        expect(url).toContain('/messages');
        expect(opts.method).toBe('POST');
        expect(opts.headers['Authorization']).toMatch(/^Bearer /);
        expect(opts.headers['Content-Type']).toBe('application/json');

        const payload = JSON.parse(opts.body);
        expect(payload.messaging_product).toBe('whatsapp');
        expect(payload.recipient_type).toBe('individual');
        expect(payload.to).toBe('+5730000000');
        expect(payload.type).toBe('interactive');
        expect(payload.interactive.type).toBe('button');
        expect(payload.interactive.body.text).toBe('¿Autorizas?');
        expect(payload.interactive.action.buttons).toEqual([
            { type: 'reply', reply: { id: 'consent_yes', title: '✅ Sí, autorizo' } },
            { type: 'reply', reply: { id: 'consent_no', title: '❌ No, gracias' } },
        ]);
    });

    it('throws when the API responds with an error (so callers can fall back)', async () => {
        fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: 'bad' }) });
        await expect(sendInteractiveButtons('+573', 'b', [{ id: 'x', title: 'X' }]))
            .rejects.toBeDefined();
    });
});

describe('sendReceptionistAlert', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    beforeEach(() => {
        vi.clearAllMocks();
        global.fetch = fetchMock;
        fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
        delete process.env.RECEPTIONIST_PHONE;
    });

    afterEach(() => {
        delete process.env.RECEPTIONIST_PHONE;
    });

    it('is a no-op (warns, does not call the API) when RECEPTIONIST_PHONE is not configured', async () => {
        await sendReceptionistAlert('Ana', 'Blanqueamiento', '+573001112233');

        expect(warnSpy).toHaveBeenCalledOnce();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('sends the formatted lead summary to the configured receptionist number', async () => {
        process.env.RECEPTIONIST_PHONE = '5731999888777';

        await sendReceptionistAlert('Ana', 'Blanqueamiento', '+573001112233');

        expect(fetchMock).toHaveBeenCalledOnce();
        const [, opts] = fetchMock.mock.calls[0];
        const payload = JSON.parse(opts.body);
        expect(payload.to).toBe('5731999888777');
        expect(payload.type).toBe('text');
        expect(payload.text.body).toContain('Ana');
        expect(payload.text.body).toContain('Blanqueamiento');
        expect(payload.text.body).toContain('+573001112233');
    });
});

describe('notifyReceptionist', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    beforeEach(() => {
        vi.clearAllMocks();
        global.fetch = fetchMock;
        fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
        delete process.env.RECEPTIONIST_PHONE;
    });

    afterEach(() => {
        delete process.env.RECEPTIONIST_PHONE;
    });

    it('is a no-op (warns, does not call the API) when RECEPTIONIST_PHONE is not configured', async () => {
        await notifyReceptionist('some notification text');

        expect(warnSpy).toHaveBeenCalledOnce();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('sends the provided text to the configured receptionist number', async () => {
        process.env.RECEPTIONIST_PHONE = '5731999888777';

        await notifyReceptionist('📎 Comprobante recibido');

        expect(fetchMock).toHaveBeenCalledOnce();
        const [, opts] = fetchMock.mock.calls[0];
        const payload = JSON.parse(opts.body);
        expect(payload.to).toBe('5731999888777');
        expect(payload.type).toBe('text');
        expect(payload.text.body).toBe('📎 Comprobante recibido');
    });
});
