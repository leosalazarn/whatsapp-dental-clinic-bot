import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';
import { verifyMetaSignature, handleInboundWebhook } from '../src/routes/webhook.js';
import { META_APP_SECRET } from '../src/config.js';

// Prevent real processMessage from running; we only assert whether it gets called
vi.mock('../src/flow.js', () => ({ processMessage: vi.fn() }));
import { processMessage } from '../src/flow.js';

function textPayload(id, text) {
    return {
        entry: [{
            changes: [{
                value: {
                    messaging_product: 'whatsapp',
                    contacts: [{ profile: { name: 'Test' } }],
                    messages: [{ id, from: '+573000000000', type: 'text', text: { body: text } }],
                },
            }],
        }],
    };
}

function buildReq(payloadObj, signature) {
    const rawBody = Buffer.from(JSON.stringify(payloadObj));
    const headers = signature === null ? {} : { 'x-hub-signature-256': signature };
    return { headers, rawBody, body: payloadObj };
}

function makeRes() {
    return {
        statusCode: null,
        body: null,
        status(code) { this.statusCode = code; return this; },
        json(obj) { this.body = obj; return this; },
        sendStatus(code) { this.statusCode = code; return this; },
    };
}

describe('verifyMetaSignature', () => {
    it('returns true for a valid HMAC over the raw body', () => {
        const raw = Buffer.from('{"a":1}');
        const sig = 'sha256=' + crypto.createHmac('sha256', META_APP_SECRET).update(raw).digest('hex');
        expect(verifyMetaSignature(raw, sig, META_APP_SECRET)).toBe(true);
    });

    it('returns false when the signature header is missing', () => {
        expect(verifyMetaSignature(Buffer.from('x'), undefined, META_APP_SECRET)).toBe(false);
    });

    it('returns false when the secret is missing (fail closed)', () => {
        const raw = Buffer.from('x');
        const sig = 'sha256=' + crypto.createHmac('sha256', 'whatever').update(raw).digest('hex');
        expect(verifyMetaSignature(raw, sig, undefined)).toBe(false);
    });

    it('returns false when the body was tampered with', () => {
        const raw = Buffer.from('{"a":1}');
        const sig = 'sha256=' + crypto.createHmac('sha256', META_APP_SECRET).update(raw).digest('hex');
        expect(verifyMetaSignature(Buffer.from('{"a":2}'), sig, META_APP_SECRET)).toBe(false);
    });

    it('returns false on length mismatch without throwing', () => {
        expect(verifyMetaSignature(Buffer.from('x'), 'sha256=abc', META_APP_SECRET)).toBe(false);
    });
});

describe('handleInboundWebhook — signature gate', () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); processMessage.mockClear(); });

    it('rejects with 401 when the signature header is missing', async () => {
        const req = buildReq(textPayload('wamid-missing', 'hola'), null);
        const res = makeRes();
        await handleInboundWebhook(req, res);
        expect(res.statusCode).toBe(401);
        expect(processMessage).not.toHaveBeenCalled();
    });

    it('rejects with 401 on an invalid/tampered signature', async () => {
        const payload = textPayload('wamid-bad', 'hola');
        const req = buildReq(payload, 'sha256=deadbeef');
        const res = makeRes();
        await handleInboundWebhook(req, res);
        expect(res.statusCode).toBe(401);
        expect(processMessage).not.toHaveBeenCalled();
    });

    it('processes the message normally with a valid signature', async () => {
        const payload = textPayload('wamid-valid', 'hola');
        const raw = Buffer.from(JSON.stringify(payload));
        const sig = 'sha256=' + crypto.createHmac('sha256', META_APP_SECRET).update(raw).digest('hex');
        const req = buildReq(payload, sig);
        const res = makeRes();
        await handleInboundWebhook(req, res);
        expect(res.statusCode).toBe(200);
        await vi.advanceTimersByTimeAsync(5000);
        expect(processMessage).toHaveBeenCalled();
    });
});
