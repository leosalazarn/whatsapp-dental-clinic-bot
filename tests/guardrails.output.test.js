import { describe, it, expect } from 'vitest';
import { containsBankDataLeak, auditOutput, containsHallucinatedPhone } from '../src/guardrails/output.js';
import { BANCOLOMBIA_ACCOUNT, NEQUI_NUMBER } from '../src/config.js';

describe('output guardrail — bank data leak detection', () => {
    it('flags bank data outside PAYMENT phase', () => {
        expect(containsBankDataLeak(`cuenta ${BANCOLOMBIA_ACCOUNT} ahorros`, 'EXTRACTION')).toBe(true);
        expect(containsBankDataLeak(`cuenta ${BANCOLOMBIA_ACCOUNT} ahorros`, 'HOOK')).toBe(true);
        expect(containsBankDataLeak(`cuenta ${BANCOLOMBIA_ACCOUNT} ahorros`, 'CLOSING')).toBe(true);
    });

    it('allows bank data in PAYMENT phase', () => {
        expect(containsBankDataLeak(`cuenta ${BANCOLOMBIA_ACCOUNT} ahorros`, 'PAYMENT')).toBe(false);
    });

    it('passes clean responses in any phase', () => {
        expect(containsBankDataLeak('¡Hola! ¿En qué te puedo ayudar?', 'EXTRACTION')).toBe(false);
        expect(containsBankDataLeak('La valoración cuesta $80.000', 'HOOK')).toBe(false);
    });

    it('auditOutput returns safe for clean responses', () => {
        const result = auditOutput('¿Cómo te llamas?', 'EXTRACTION');
        expect(result.safe).toBe(true);
        expect(result.text).toBe('¿Cómo te llamas?');
    });

    it('auditOutput returns safe:false and fallback message for leaks', () => {
        const result = auditOutput(`Tu cuenta es ${BANCOLOMBIA_ACCOUNT}`, 'HOOK');
        expect(result.safe).toBe(false);
        expect(result.reason).toBe('bank_data_leak');
        expect(result.text).toContain('equipo');
    });
});

// ─── output guardrail — hallucinated phone detection ─────────────────────────

describe('output guardrail — hallucinated phone detection', () => {
    it('flags an invented 10-digit number starting with 3', () => {
        expect(containsHallucinatedPhone('Nequi\nN° 3102345678')).toBe(true);
    });

    it('does NOT flag the real Nequi number', () => {
        expect(containsHallucinatedPhone('Nequi\nN° ' + NEQUI_NUMBER)).toBe(false);
    });

    it('auditOutput blocks a hallucinated phone with safe:false regardless of phase', () => {
        const result = auditOutput('Mi Nequi es 3102345678', 'EXTRACTION');
        expect(result.safe).toBe(false);
        expect(result.reason).toBe('hallucinated_phone');
        expect(result.text).toContain('equipo');
    });

    it('auditOutput allows clean text containing the real Nequi number', () => {
        const result = auditOutput('Nequi ' + NEQUI_NUMBER, 'PAYMENT');
        expect(result.safe).toBe(true);
    });
});
