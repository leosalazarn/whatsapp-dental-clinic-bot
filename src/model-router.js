import Anthropic from '@anthropic-ai/sdk';
import { ANTHROPIC_API_KEY, MODEL_SIMPLE, MODEL_COMPLEX, TOKENS_SIMPLE, TOKENS_COMPLEX, CLASSIFIER_MAX_TOKENS, CLASSIFIER_LENGTH_THRESHOLD, COMPLEX_SIGNALS, POSITIVE_RESPONSES } from './config.js';
import log from './utils/logger.js';

const ai = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

const isPositive = (text) =>
    POSITIVE_RESPONSES.some(word => text.toLowerCase().includes(word));

const findComplexSignal = (text) =>
    COMPLEX_SIGNALS.some(signal => text.toLowerCase().includes(signal));

const CLASSIFIER_SYSTEM = `Eres un clasificador de mensajes para una clínica dental. Debes responder ÚNICAMENTE con un objeto JSON válido, sin texto adicional.

Clasifica el mensaje del usuario como "SIMPLE" o "COMPLEX":

- SIMPLE: saludos, preguntas muy genéricas sin señales de objeción.
- COMPLEX: cualquier mensaje con dudas sobre tratamientos, preguntas médicas o de procedimiento, señales de indecisión.

Ejemplos de respuesta:
{"route": "SIMPLE"}
{"route": "COMPLEX"}`;

function parseRoute(raw) {
    try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.route === 'string') {
            return parsed.route;
        }
        return null;
    } catch {
        return null;
    }
}

async function classifyWithLLM(userMessage) {
    try {
        const response = await ai.messages.create({
            model: MODEL_SIMPLE,
            max_tokens: CLASSIFIER_MAX_TOKENS,
            system: CLASSIFIER_SYSTEM,
            messages: [{ role: 'user', content: userMessage }],
        });

        const route = parseRoute(response.content[0].text);
        if (route === 'SIMPLE' || route === 'COMPLEX') {
            return route;
        }

        log.warn('ModelRouterService', `Invalid classification "${response.content[0].text}" — falling back to SIMPLE`);
        return 'SIMPLE';
    } catch (error) {
        log.error('ModelRouterService classifyWithLLM', error?.message || error);
        return 'SIMPLE';
    }
}

export async function classifyMessage(userMessage, phase = 'START', session = {}) {
    const phone = session?.phone || 'unknown';

    // Layer 1 — Phase check (free, deterministic)
    if (phase === 'PAYMENT' || phase === 'CLOSING') {
        log.info('ROUTE', { phone, phase, layer: 'phase', route: 'COMPLEX' });
        return { route: 'COMPLEX', layer: 'phase' };
    }

    if (phase === 'HOOK' && isPositive(userMessage)) {
        log.info('ROUTE', { phone, phase, layer: 'phase', route: 'COMPLEX' });
        return { route: 'COMPLEX', layer: 'phase' };
    }

    // Layer 2 — Keyword scan (free)
    if (findComplexSignal(userMessage)) {
        log.info('ROUTE', { phone, phase, layer: 'keyword', route: 'COMPLEX' });
        return { route: 'COMPLEX', layer: 'keyword' };
    }

    // Layer 3 — Length heuristic (free)
    if (userMessage.length > CLASSIFIER_LENGTH_THRESHOLD) {
        log.info('ROUTE', { phone, phase, layer: 'length', route: 'COMPLEX' });
        return { route: 'COMPLEX', layer: 'length' };
    }

    // Layer 4 — LLM-as-judge (only for remaining ambiguous)
    const llmRoute = await classifyWithLLM(userMessage);
    log.info('ROUTE', { phone, phase, layer: 'llm', route: llmRoute });
    return { route: llmRoute, layer: 'llm' };
}

export async function routeMessage(userMessage, phase = 'START', session = {}) {
    const { route, layer } = await classifyMessage(userMessage, phase, session);

    if (route === 'COMPLEX') {
        return {
            route: 'COMPLEX',
            layer,
            model: MODEL_COMPLEX,
            maxTokens: TOKENS_COMPLEX,
        };
    }

    return {
        route: 'SIMPLE',
        layer,
        model: MODEL_SIMPLE,
        maxTokens: TOKENS_SIMPLE,
    };
}
