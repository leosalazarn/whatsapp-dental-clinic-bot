import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Track Supabase builder calls via hoisted spies so we can assert query shape.
const state = vi.hoisted(() => ({
    rows: [],
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
    eq: vi.fn(),
    lte: vi.fn(),
    single: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => {
    const b = {
        select: (...a) => { state.select(...a); return b; },
        update: (...a) => { state.update(...a); return b; },
        insert: (...a) => { state.insert(...a); return b; },
        eq: (...a) => { state.eq(...a); return b; },
        lte: (...a) => { state.lte(...a); return b; },
        single: (...a) => { state.single(...a); return b; },
        then: (resolve) => resolve({ data: state.rows, error: null }),
    };
    return { createClient: vi.fn(() => ({ from: () => b })) };
});

vi.mock('../src/whatsapp.js', () => ({
    sendMessage: vi.fn().mockResolvedValue(undefined),
    sendInteractiveButtons: vi.fn().mockResolvedValue(undefined),
}));

import {
    scheduleReengagement,
    cancelReengagement,
    startReengagementPoller,
    stopReengagementPoller,
} from '../src/reengagement.js';
import { sendMessage } from '../src/whatsapp.js';

describe('reengagement queue', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        state.rows = [];
    });

    afterEach(() => {
        stopReengagementPoller();
    });

    it('scheduleReengagement cancels prior rows then inserts the new one', async () => {
        await scheduleReengagement('+573001', 'msg1', 'HOOK', 1000);
        await scheduleReengagement('+573001', 'msg2', 'HOOK', 2000);

        // Each schedule cancels pending rows for the phone.
        expect(state.update).toHaveBeenCalledTimes(2);
        expect(state.update.mock.calls[0][0]).toEqual({ cancelled: true });
        expect(state.eq).toHaveBeenCalledWith('phone', '+573001');
        expect(state.eq).toHaveBeenCalledWith('sent', false);

        // And inserts a fresh row each time.
        expect(state.insert).toHaveBeenCalledTimes(2);
        const first = state.insert.mock.calls[0][0];
        expect(first.phone).toBe('+573001');
        expect(first.message).toBe('msg1');
        expect(first.phase).toBe('HOOK');
        expect(typeof first.scheduled_at).toBe('string');
        expect(state.insert.mock.calls[1][0].message).toBe('msg2');
    });

    it('cancelReengagement marks pending rows cancelled', async () => {
        await cancelReengagement('+573001');
        expect(state.update).toHaveBeenCalledTimes(1);
        expect(state.update.mock.calls[0][0]).toEqual({ cancelled: true });
        expect(state.eq).toHaveBeenCalledWith('phone', '+573001');
        expect(state.eq).toHaveBeenCalledWith('sent', false);
    });

    it('poller sends due rows and marks them sent', async () => {
        const dueAt = new Date(Date.now() - 10_000).toISOString();
        state.rows = [{
            id: 1, phone: '+573001', message: 'hi', phase: 'HOOK',
            sent: false, cancelled: false, scheduled_at: dueAt,
        }];

        await startReengagementPoller();

        expect(sendMessage).toHaveBeenCalledTimes(1);
        expect(sendMessage).toHaveBeenCalledWith('+573001', 'hi');

        const sentCall = state.update.mock.calls.find((c) => c[0] && c[0].sent === true);
        expect(sentCall).toBeTruthy();
        expect(typeof sentCall[0].sent_at).toBe('string');
        expect(state.eq).toHaveBeenCalledWith('id', 1);
    });

    it('poller skips already-sent and cancelled rows', async () => {
        const past = new Date(Date.now() - 10_000).toISOString();
        state.rows = [
            { id: 1, phone: '+57a', message: 'a', sent: true, cancelled: false, scheduled_at: past },
            { id: 2, phone: '+57b', message: 'b', sent: false, cancelled: true, scheduled_at: past },
            { id: 3, phone: '+57c', message: 'c', sent: false, cancelled: false, scheduled_at: past },
        ];

        await startReengagementPoller();

        expect(sendMessage).toHaveBeenCalledTimes(1);
        expect(sendMessage).toHaveBeenCalledWith('+57c', 'c');
    });
});
