import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }));

vi.mock('@anthropic-ai/sdk', () => ({
    default: vi.fn(function () {
        return { messages: { create: mockCreate } };
    }),
}));

import { classifyMessage, routeMessage } from '../src/model-router.js';
import { MODEL_SIMPLE, MODEL_COMPLEX, TOKENS_SIMPLE, TOKENS_COMPLEX } from '../src/config.js';

beforeEach(() => {
    vi.resetAllMocks();
});

describe('classifyMessage — Layer 1: phase check', () => {
    it('returns COMPLEX for PAYMENT phase regardless of message', async () => {
        const result = await classifyMessage('hola', 'PAYMENT');
        expect(result).toEqual({ route: 'COMPLEX', layer: 'phase' });
        expect(mockCreate).not.toHaveBeenCalled();
    });

    it('returns COMPLEX for CLOSING phase regardless of message', async () => {
        const result = await classifyMessage('ok', 'CLOSING');
        expect(result).toEqual({ route: 'COMPLEX', layer: 'phase' });
        expect(mockCreate).not.toHaveBeenCalled();
    });

    it('returns COMPLEX for HOOK phase with positive response', async () => {
        const result = await classifyMessage('sí quiero agendar', 'HOOK');
        expect(result).toEqual({ route: 'COMPLEX', layer: 'phase' });
        expect(mockCreate).not.toHaveBeenCalled();
    });

    it('does not return COMPLEX for HOOK phase with negative response (continues to next layer)', async () => {
        mockCreate.mockResolvedValueOnce({
            content: [{ text: '{"route": "SIMPLE"}' }],
        });

        const result = await classifyMessage('no gracias', 'HOOK');

        expect(result).toEqual({ route: 'SIMPLE', layer: 'llm' });
        expect(mockCreate).toHaveBeenCalledOnce();
    });
});

describe('classifyMessage — Layer 2: keyword scan', () => {
    it('returns COMPLEX when message contains "duele"', async () => {
        const result = await classifyMessage('me duele una muela', 'EXTRACTION');
        expect(result).toEqual({ route: 'COMPLEX', layer: 'keyword' });
        expect(mockCreate).not.toHaveBeenCalled();
    });

    it('returns COMPLEX when message contains "precio"', async () => {
        const result = await classifyMessage('cuánto cuesta el blanqueamiento', 'EXTRACTION');
        expect(result).toEqual({ route: 'COMPLEX', layer: 'keyword' });
        expect(mockCreate).not.toHaveBeenCalled();
    });

    it('returns COMPLEX when message contains "no puedo"', async () => {
        const result = await classifyMessage('no puedo ir esta semana', 'EXTRACTION');
        expect(result).toEqual({ route: 'COMPLEX', layer: 'keyword' });
        expect(mockCreate).not.toHaveBeenCalled();
    });
});

describe('classifyMessage — Layer 3: length heuristic', () => {
    it('returns COMPLEX for messages over 120 chars with no keywords', async () => {
        const longText = 'Hola, quería preguntarles algo sobre los tratamientos que ofrecen. Me interesa mejorar mi sonrisa pero tengo algunas dudas sobre el proceso y los materiales que usan.';
        expect(longText.length).toBeGreaterThan(120);

        const result = await classifyMessage(longText, 'EXTRACTION');
        expect(result).toEqual({ route: 'COMPLEX', layer: 'length' });
        expect(mockCreate).not.toHaveBeenCalled();
    });
});

describe('classifyMessage — Layer 4: LLM-as-judge', () => {
    it('returns SIMPLE for a greeting via LLM', async () => {
        mockCreate.mockResolvedValueOnce({
            content: [{ text: '{"route": "SIMPLE"}' }],
        });

        const result = await classifyMessage('Hola, ¿cuándo abren?', 'EXTRACTION');

        expect(result).toEqual({ route: 'SIMPLE', layer: 'llm' });
        expect(mockCreate).toHaveBeenCalledOnce();
    });

    it('returns COMPLEX for a multi-intent message via LLM', async () => {
        mockCreate.mockResolvedValueOnce({
            content: [{ text: '{"route": "COMPLEX"}' }],
        });

        const result = await classifyMessage(
            '¿Qué tratamiento me recomiendan para la sonrisa?',
            'EXTRACTION'
        );

        expect(result).toEqual({ route: 'COMPLEX', layer: 'llm' });
    });

    it('falls back to SIMPLE when the API returns invalid JSON', async () => {
        mockCreate.mockResolvedValueOnce({
            content: [{ text: 'Claro, aquí tienes la información...' }],
        });

        const result = await classifyMessage('Hola', 'EXTRACTION');

        expect(result).toEqual({ route: 'SIMPLE', layer: 'llm' });
    });

    it('falls back to SIMPLE when the API throws', async () => {
        mockCreate.mockRejectedValueOnce(new Error('API timeout'));

        const result = await classifyMessage('Hola', 'EXTRACTION');

        expect(result).toEqual({ route: 'SIMPLE', layer: 'llm' });
    });
});

describe('routeMessage', () => {
    it('returns Haiku config for SIMPLE classification', async () => {
        mockCreate.mockResolvedValueOnce({
            content: [{ text: '{"route": "SIMPLE"}' }],
        });

        const config = await routeMessage('Hola', 'EXTRACTION');

        expect(config).toEqual({
            route: 'SIMPLE',
            layer: 'llm',
            model: MODEL_SIMPLE,
            maxTokens: TOKENS_SIMPLE,
        });
    });

    it('returns Sonnet config for COMPLEX classification via phase', async () => {
        const config = await routeMessage('hola', 'PAYMENT');

        expect(config).toEqual({
            route: 'COMPLEX',
            layer: 'phase',
            model: MODEL_COMPLEX,
            maxTokens: TOKENS_COMPLEX,
        });
        expect(mockCreate).not.toHaveBeenCalled();
    });

    it('returns Sonnet config for COMPLEX classification via keyword', async () => {
        const config = await routeMessage('me duele', 'EXTRACTION');

        expect(config).toEqual({
            route: 'COMPLEX',
            layer: 'keyword',
            model: MODEL_COMPLEX,
            maxTokens: TOKENS_COMPLEX,
        });
        expect(mockCreate).not.toHaveBeenCalled();
    });
});
