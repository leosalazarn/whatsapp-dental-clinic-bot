// AI module — Claude API integration with retry logic
import Anthropic from '@anthropic-ai/sdk';
import {ANTHROPIC_API_KEY, MODEL_SIMPLE, TOKENS_SIMPLE} from './config.js';
import log from './utils/logger.js';

const ai = new Anthropic({apiKey: ANTHROPIC_API_KEY});

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000; // 2s between retries

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export async function callValeria(history, systemPrompt, model = MODEL_SIMPLE, maxTokens = TOKENS_SIMPLE) {
    let lastError;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const response = await ai.messages.create({
                model,
                max_tokens: maxTokens,
                system: systemPrompt,
                messages: history,
            });

            return {
                text: response.content[0].text,
                input_tokens: response.usage.input_tokens,
                output_tokens: response.usage.output_tokens,
            };

        } catch (error) {
            lastError = error;
            const status = error?.status || error?.message;
            const isOverloaded = error?.status === 529 || error?.message?.includes('overloaded');
            const isRetryable = isOverloaded || error?.status === 503 || error?.status === 500;

            if (isRetryable && attempt < MAX_RETRIES) {
                log.warn('Claude API call', `Attempt ${attempt}/${MAX_RETRIES} failed (${status}) — retrying in ${RETRY_DELAY_MS / 1000}s`);
                await sleep(RETRY_DELAY_MS * attempt); // exponential backoff: 2s, 4s
                continue;
            }

            log.error('Claude API call', error);
            throw error;
        }
    }

    throw lastError;
}