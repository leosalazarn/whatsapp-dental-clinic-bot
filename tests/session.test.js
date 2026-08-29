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

import {
    getSession,
    updateSession,
    addMessageToHistory,
    clearReengagementTimer,
    setReengagementTimer,
} from '../src/session.js';
import { MAX_HISTORY } from '../src/config.js';

const phone = (n) => `+5731000${n}`;

describe('session — getSession', () => {
    it('creates a new session with defaults for unknown phone', async () => {
        const session = await getSession(phone('s-01'));
        expect(session.history).toEqual([]);
        expect(session.name).toBeNull();
        expect(session.aesthetic_goal).toBeNull();
        expect(session.phase).toBe('START');
        expect(session.source).toBe('ORGANIC');
        expect(session.data_complete).toBe(false);
        expect(session.last_interaction).toBeTruthy();
    });

    it('returns the same session object on subsequent calls', async () => {
        const p = phone('s-02');
        const s1 = await getSession(p);
        const s2 = await getSession(p);
        expect(s1).toBe(s2);
    });

    it('updates last_interaction on every access', async () => {
        const p = phone('s-03');
        const t1 = (await getSession(p)).last_interaction;
        await new Promise(r => setTimeout(r, 5));
        const t2 = (await getSession(p)).last_interaction;
        expect(t2).not.toBe(t1);
    });
});

describe('session — updateSession', () => {
    it('merges data into existing session', async () => {
        const p = phone('s-04');
        await getSession(p);
        await updateSession(p, { name: 'Luisa', aesthetic_goal: 'diseño de sonrisa' });
        const session = await getSession(p);
        expect(session.name).toBe('Luisa');
        expect(session.aesthetic_goal).toBe('diseño de sonrisa');
    });

    it('does not wipe unrelated fields', async () => {
        const p = phone('s-05');
        await getSession(p);
        await updateSession(p, { name: 'Jorge' });
        await updateSession(p, { aesthetic_goal: 'blanqueamiento' });
        const session = await getSession(p);
        expect(session.name).toBe('Jorge');
        expect(session.aesthetic_goal).toBe('blanqueamiento');
    });

    it('updates phase correctly', async () => {
        const p = phone('s-06');
        await getSession(p);
        await updateSession(p, { phase: 'HOOK' });
        expect((await getSession(p)).phase).toBe('HOOK');
    });
});

describe('session — addMessageToHistory', () => {
    it('appends user and assistant messages', async () => {
        const p = phone('s-07');
        await addMessageToHistory(p, 'user', 'Hola');
        await addMessageToHistory(p, 'assistant', 'Hola! ¿Cómo te llamas?');
        const { history } = await getSession(p);
        expect(history).toHaveLength(2);
        expect(history[0]).toEqual({ role: 'user', content: 'Hola' });
        expect(history[1]).toEqual({ role: 'assistant', content: 'Hola! ¿Cómo te llamas?' });
    });

    it(`enforces sliding window of MAX_HISTORY (${MAX_HISTORY}) messages`, async () => {
        const p = phone('s-08');
        for (let i = 0; i < MAX_HISTORY + 5; i++) {
            await addMessageToHistory(p, 'user', `msg ${i}`);
        }
        expect((await getSession(p)).history).toHaveLength(MAX_HISTORY);
    });

    it('drops oldest message when window is full', async () => {
        const p = phone('s-09');
        for (let i = 0; i < MAX_HISTORY; i++) {
            await addMessageToHistory(p, 'user', `msg ${i}`);
        }
        await addMessageToHistory(p, 'user', 'newest');
        const { history } = await getSession(p);
        expect(history[0].content).toBe('msg 1');
        expect(history[history.length - 1].content).toBe('newest');
    });
});

describe('session — reengagement timers', () => {
    it('clearReengagementTimer is safe when no timer is set', () => {
        expect(() => clearReengagementTimer(phone('s-10'))).not.toThrow();
    });

    it('setReengagementTimer fires the callback after delay', async () => {
        vi.useFakeTimers();
        const p = phone('s-11');
        await getSession(p);
        const callback = vi.fn();
        setReengagementTimer(p, callback, 1000);
        expect(callback).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1000);
        expect(callback).toHaveBeenCalledOnce();
        vi.useRealTimers();
    });

    it('clearReengagementTimer cancels the callback', async () => {
        vi.useFakeTimers();
        const p = phone('s-12');
        await getSession(p);
        const callback = vi.fn();
        setReengagementTimer(p, callback, 1000);
        clearReengagementTimer(p);
        vi.advanceTimersByTime(2000);
        expect(callback).not.toHaveBeenCalled();
        vi.useRealTimers();
    });

    it('setting a new timer cancels the previous one', async () => {
        vi.useFakeTimers();
        const p = phone('s-13');
        await getSession(p);
        const first = vi.fn();
        const second = vi.fn();
        setReengagementTimer(p, first, 500);
        setReengagementTimer(p, second, 500); // replaces first
        vi.advanceTimersByTime(500);
        expect(first).not.toHaveBeenCalled();
        expect(second).toHaveBeenCalledOnce();
        vi.useRealTimers();
    });
});
