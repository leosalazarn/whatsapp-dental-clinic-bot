import { describe, it, expect } from 'vitest';
import { extractInboundText } from '../src/routes/webhook.js';

describe('extractInboundText', () => {
    it('returns plain text body for text messages', () => {
        expect(extractInboundText({ type: 'text', text: { body: 'hola' } })).toBe('hola');
    });

    it('normalizes interactive button_reply.id to text (consent_yes)', () => {
        const msg = {
            type: 'interactive',
            interactive: { type: 'button_reply', button_reply: { id: 'consent_yes' } },
        };
        expect(extractInboundText(msg)).toBe('consent_yes');
    });

    it('normalizes interactive button_reply.id to text (consent_no)', () => {
        const msg = {
            type: 'interactive',
            interactive: { type: 'button_reply', button_reply: { id: 'consent_no' } },
        };
        expect(extractInboundText(msg)).toBe('consent_no');
    });

    it('returns [COMPROBANTE_SENT] for image and document messages', () => {
        expect(extractInboundText({ type: 'image' })).toBe('[COMPROBANTE_SENT]');
        expect(extractInboundText({ type: 'document' })).toBe('[COMPROBANTE_SENT]');
    });

    it('returns null for other unsupported types and missing payloads', () => {
        expect(extractInboundText({ type: 'audio' })).toBeNull();
        expect(extractInboundText({ type: 'video' })).toBeNull();
        expect(extractInboundText({ type: 'sticker' })).toBeNull();
        expect(extractInboundText({ type: 'location' })).toBeNull();
        expect(extractInboundText({ type: 'contacts' })).toBeNull();
        expect(extractInboundText(null)).toBeNull();
        expect(extractInboundText(undefined)).toBeNull();
    });
});
