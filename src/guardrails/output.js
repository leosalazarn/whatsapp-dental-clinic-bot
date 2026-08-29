import { BANCOLOMBIA_ACCOUNT, NEQUI_NUMBER, DAVIVIENDA_ACCOUNT, BANK_HOLDER_CC } from '../config.js';
import log from '../utils/logger.js';

const BANK_DATA_PATTERNS = [
    BANCOLOMBIA_ACCOUNT,
    NEQUI_NUMBER,
    DAVIVIENDA_ACCOUNT,
    BANK_HOLDER_CC,
].filter(Boolean);

// Colombian mobile numbers are 10 digits starting with 3
const COL_PHONE_RE = /\b3\d{9}\b/g;

export function containsBankDataLeak(responseText, sessionPhase) {
    if (sessionPhase === 'PAYMENT') return false;
    return BANK_DATA_PATTERNS.some(pattern => responseText.includes(pattern));
}

// Detect invented phone-like numbers (e.g. a hallucinated Nequi) that are NOT real known values
export function containsHallucinatedPhone(responseText) {
    const matches = responseText.match(COL_PHONE_RE) || [];
    return matches.some(m => !BANK_DATA_PATTERNS.includes(m));
}

export function auditOutput(responseText, sessionPhase) {
    if (containsBankDataLeak(responseText, sessionPhase)) {
        log.warn('OUTPUT_GUARDRAIL', `Bank data detected outside PAYMENT phase (phase: ${sessionPhase})`);
        return {
            safe: false,
            reason: 'bank_data_leak',
            text: 'En este momento no puedo procesar esa información. Nuestro equipo te contactará pronto 🙌',
        };
    }
    if (containsHallucinatedPhone(responseText)) {
        log.warn('OUTPUT_GUARDRAIL', `Hallucinated phone-like number detected (phase: ${sessionPhase})`);
        return {
            safe: false,
            reason: 'hallucinated_phone',
            text: 'En este momento no puedo procesar esa información. Nuestro equipo te contactará pronto 🙌',
        };
    }
    return { safe: true, reason: null, text: responseText };
}
