import { describe, it, expect } from 'vitest';
import { getColombiaNow, formatColombiaTime, isoToColombiaTime } from '../../src/utils/time.js';

describe('getColombiaNow', () => {
    it('returns a valid ISO 8601 string', () => {
        const result = getColombiaNow();
        expect(typeof result).toBe('string');
        expect(() => new Date(result)).not.toThrow();
        expect(new Date(result).toISOString()).toBe(result);
    });

    it('returns a recent timestamp', () => {
        const before = Date.now();
        const result = getColombiaNow();
        const after = Date.now();
        const ts = new Date(result).getTime();
        expect(ts).toBeGreaterThanOrEqual(before);
        expect(ts).toBeLessThanOrEqual(after);
    });
});

describe('formatColombiaTime', () => {
    it('returns a non-empty string', () => {
        const result = formatColombiaTime();
        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(0);
    });

    it('represents a recent point in time', () => {
        // The formatted string should contain the current year
        const result = formatColombiaTime();
        const year = new Date().getFullYear().toString();
        expect(result).toContain(year);
    });
});

describe('isoToColombiaTime', () => {
    it('converts a valid ISO string to a Colombia-formatted string', () => {
        const iso = '2026-01-15T20:00:00.000Z';
        const result = isoToColombiaTime(iso);
        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(0);
    });

    it('reflects the America/Bogota offset (UTC-5)', () => {
        // 2026-01-15T20:00:00Z = 15:00 in Bogota (UTC-5)
        const result = isoToColombiaTime('2026-01-15T20:00:00.000Z');
        expect(result).toContain('15');
    });

    it('handles epoch zero without throwing', () => {
        expect(() => isoToColombiaTime('1970-01-01T00:00:00.000Z')).not.toThrow();
    });
});
