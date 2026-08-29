// Webhook routes — Meta webhook verification and message receiving
import express from 'express';
import crypto from 'crypto';
import {VERIFY_TOKEN, MSG_NON_TEXT, META_APP_SECRET, DEDUP_TTL_MS, MAX_BUFFER_SIZE, DEBOUNCE_MS} from '../config.js';
import {processMessage} from '../flow.js';
import {detectInjectionAttempt} from '../validators/index.js';
import log from '../utils/logger.js';

const router = express.Router();

// ── Signature verification — Meta sends x-hub-signature-256 = "sha256=" + HMAC-SHA256(rawBody, appSecret).
//    Fail closed: missing secret, missing header, length mismatch, or mismatch => reject.
export function verifyMetaSignature(rawBody, signatureHeader, secret) {
    if (!rawBody || !signatureHeader || !secret) return false;
    const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(signatureHeader);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
}

// ── Deduplication — prevent Meta retries from processing same message twice
const processedIds = new Set();

function sanitizeInput(text) {
    // Basic cleaning: remove control characters and limit length
    return text
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Remove control characters
        .slice(0, 1000) // Cap individual message length
        .trim();
}

// Normalize an inbound WhatsApp message to plain text. Interactive button replies (e.g. the
// consent prompt) carry the chosen button id in `interactive.button_reply.id` — surface it as
// the message text so every downstream component (flow.js, session, history) needs no changes.
// Returns null for unsupported message types (handled as non-text by the caller).
export function extractInboundText(message) {
    if (message?.type === 'interactive' && message?.interactive?.type === 'button_reply') {
        return message.interactive.button_reply.id;
    }
    if (message?.type === 'text') {
        return message.text.body;
    }
    if (message?.type === 'image' || message?.type === 'document') {
        return '[COMPROBANTE_SENT]';
    }
    return null;
}

function isDuplicate(messageId) {
    if (processedIds.has(messageId)) return true;
    processedIds.add(messageId);
    setTimeout(() => processedIds.delete(messageId), DEDUP_TTL_MS);
    return false;
}

// ── Message debounce buffer — accumulates rapid consecutive messages
const messageBuffers = new Map();
const BUFFER_HARD_CAP = 5;

function flushBuffer(phone, chatType) {
    const entry = messageBuffers.get(phone);
    if (!entry) return;
    clearTimeout(entry.timer);
    const combined = entry.messages.join('\n');
    messageBuffers.delete(phone);
    processMessage(phone, combined, chatType);
}

function debounceMessage(phone, text, chatType) {
    const sanitized = sanitizeInput(text);

    if (messageBuffers.has(phone)) {
        const entry = messageBuffers.get(phone);
        clearTimeout(entry.timer);

        // Anti-flood: only add if buffer is not full
        if (entry.messages.length < MAX_BUFFER_SIZE) {
            entry.messages.push(sanitized);
        } else if (entry.messages.length === MAX_BUFFER_SIZE) {
            entry.messages.push('... [mensajes omitidos por exceso]');
            log.warn(`Anti-flood triggered for ${phone}`);
        }
    } else {
        messageBuffers.set(phone, {messages: [sanitized], timer: null});
    }

    const entry = messageBuffers.get(phone);

    // Hard cap: process immediately at BUFFER_HARD_CAP messages
    if (entry.messages.length >= BUFFER_HARD_CAP) {
        flushBuffer(phone, chatType);
        return;
    }

    entry.timer = setTimeout(() => {
        flushBuffer(phone, chatType);
    }, DEBOUNCE_MS);
}

// GET / — Meta verification (mounted at /webhook in server.js)
router.get('/', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    // Sanitize challenge — must be a plain numeric string (Meta always sends a number)
    const safeChallenge = /^\d+$/.test(challenge) ? challenge : '';

    if (mode === 'subscribe' && token === VERIFY_TOKEN && safeChallenge) {
        log.success('Webhook verified by Meta');
        res.status(200).send(safeChallenge);
    } else {
        log.warn('Webhook verification', 'Invalid token, mode, or challenge');
        res.sendStatus(403);
    }
});

// POST / — receive WhatsApp messages (mounted at /webhook in server.js)
export async function handleInboundWebhook(req, res) {
    // Validate the request signature before doing anything else (fail closed)
    if (!verifyMetaSignature(req.rawBody, req.headers['x-hub-signature-256'], META_APP_SECRET)) {
        log.warn('Webhook signature', 'Invalid or missing x-hub-signature-256 — rejecting request');
        return res.status(401).json({ error: 'Invalid signature' });
    }

    // Respond to Meta immediately (< 5 seconds)
    res.sendStatus(200);

    try {
        const body = req.body;
        const entry = body?.entry?.[0];
        const changes = entry?.changes?.[0];
        const value = changes?.value;

        if (!value?.messages) return;

        const message = value.messages[0];

        // Deduplicate — ignore Meta retries
        if (isDuplicate(message.id)) {
            log.info(`Duplicate message ignored: ${message.id}`);
            return;
        }

        // Normalize to plain text (interactive button replies surface the button id).
        const normalizedText = extractInboundText(message);
        if (!normalizedText) {
            const phone = message.from;
            const { sendMessage } = await import('../whatsapp.js');
            await sendMessage(phone, MSG_NON_TEXT);
            return;
        }

        const phoneWA = message.from;
        const text = sanitizeInput(normalizedText);
        const chatType = value.contacts?.[0]?.profile?.name ? 'individual' : 'group';

        // Injection detection — block jailbreak/prompt leak attempts before processing
        if (detectInjectionAttempt(text)) {
            log.warn('INJECTION_ATTEMPT', `Blocked from: ${phoneWA}`);
            const { sendMessage } = await import('../whatsapp.js');
            await sendMessage(phoneWA, 'No puedo ayudarte con eso 🦷 ¿Hay algo sobre nuestros tratamientos en lo que te pueda ayudar?');
            return;
        }

        // Debounce — wait 10s to group consecutive messages
        debounceMessage(phoneWA, text, chatType);

    } catch (error) {
        log.error('POST /webhook', error);
    }
}

// POST /webhook is machine-to-machine (Meta Cloud API). CSRF does not apply:
// authenticity is verified by HMAC-SHA256 on x-hub-signature-256. // lgtm[js/missing-token-validation]
router.post('/', handleInboundWebhook);

export default router;