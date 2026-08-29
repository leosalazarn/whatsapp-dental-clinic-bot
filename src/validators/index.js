const INJECTION_PATTERNS = [
    /ignore\s+(previous|all|your)\s+instructions?/i,
    /forget\s+(your|all|previous)\s+instructions?/i,
    /system\s*prompt/i,
    /you\s+are\s+now\s+(a|an|DAN|evil|unrestricted)/i,
    /pretend\s+(you\s+are|to\s+be)\s+(a|an)/i,
    /act\s+as\s+(if\s+you\s+(are|were)|a|an)\s+/i,
    /\bDAN\b/,
    /jailbreak/i,
    /override\s+(your|all)\s+(rules?|instructions?|training)/i,
    /reveal\s+(your|the)\s+(prompt|instructions?|system)/i,
];

export function detectInjectionAttempt(text) {
    return INJECTION_PATTERNS.some(pattern => pattern.test(text));
}

export function sanitizeText(text) {
    return text
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
        .slice(0, 1000)
        .trim();
}

export function isValidPhone(phone) {
    return typeof phone === 'string' && phone.length > 5 && phone.length < 20;
}

export function isValidWebhookChallenge(challenge) {
    return /^\d+$/.test(challenge);
}
