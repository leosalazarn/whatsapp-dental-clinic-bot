import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import express from 'express';

const eqResult = { data: [{ phone: '+573001' }], error: null };

const makeBuilder = () => {
    const p = Promise.resolve(eqResult);
    p.eq = vi.fn(() => p);
    p.select = vi.fn(() => p);
    p.single = vi.fn(() => p);
    return p;
};

const update = vi.fn(() => makeBuilder());
const del = vi.fn(() => makeBuilder());
const select = vi.fn(() => makeBuilder());

vi.mock('@supabase/supabase-js', () => ({
    createClient: vi.fn(() => ({ from: vi.fn(() => ({ update, delete: del, select })) })),
}));

vi.mock('../src/reengagement.js', () => ({
    cancelReengagement: vi.fn().mockResolvedValue(undefined),
}));

import router from '../src/routes/debug.js';
import { cancelReengagement } from '../src/reengagement.js';
import { DEBUG_API_KEY } from '../src/config.js';

const phone = '+573001';
const encodedPhone = encodeURIComponent(phone);

let server;
let base;

beforeAll(() => {
    const app = express();
    app.use(express.json());
    app.use('/debug', router);
    server = app.listen(0);
    base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => {
    server.close();
});

async function callReset() {
    return fetch(`${base}/debug/reset/${encodedPhone}`, {
        method: 'POST',
        headers: { 'x-api-key': DEBUG_API_KEY },
    });
}

describe('POST /debug/reset/:phone', () => {
    it('returns success and resets the conversation', async () => {
        const res = await callReset();
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body).toEqual({ success: true, phone });

        // Supabase row updated with initial values.
        expect(update).toHaveBeenCalledWith(expect.objectContaining({
            phase: 'START',
            name: null,
            aesthetic_goal: null,
            full_name: null,
            email: null,
            consultation_reason: null,
            data_complete: false,
            payment_info_sent: false,
            message_count: 0,
            history: [],
        }));

        // Pending re-engagement rows cancelled.
        expect(cancelReengagement).toHaveBeenCalledWith(phone);
    });

    it('rejects requests without the API key', async () => {
        const res = await fetch(`${base}/debug/reset/${encodedPhone}`, { method: 'POST' });
        expect(res.status).toBe(401);
    });
});

async function callDelete() {
    return fetch(`${base}/debug/patient/${encodedPhone}`, {
        method: 'DELETE',
        headers: { 'x-api-key': DEBUG_API_KEY },
    });
}

describe('DELETE /debug/patient/:phone', () => {
    it('returns success and erases the patient with valid auth', async () => {
        const res = await callDelete();
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body).toEqual({ deleted: true, phone });
        // Patient data deleted from the store (patients + conversations + reengagement_queue).
        expect(del).toHaveBeenCalled();
    });

    it('rejects requests without the API key', async () => {
        const res = await fetch(`${base}/debug/patient/${encodedPhone}`, { method: 'DELETE' });
        expect(res.status).toBe(401);
    });
});
