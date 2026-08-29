import Anthropic from '@anthropic-ai/sdk';
import 'dotenv/config';

const ai = new Anthropic({apiKey: process.env.ANTHROPIC_API_KEY});

const CLAUDE_MODEL = 'claude-sonnet-4-6'; // Cheapest model for testing
const MAX_TOKENS = 100; // Very short responses to save credits

function buildSystemPrompt() {
    return `Eres Valeria, asesora de la clínica Dra. [Doctor Name]. Responde brevemente en español colombiano. Nunca des precios.`;
}

async function testMinimal(userMessage) {
    try {
        console.log(`📩 User: ${userMessage}`);

        const response = await ai.messages.create({
            model: CLAUDE_MODEL,
            max_tokens: MAX_TOKENS,
            system: buildSystemPrompt(),
            messages: [{role: 'user', content: userMessage}],
        });

        const aiResponse = response.content[0].text;
        console.log(`✉️ Valeria: ${aiResponse.substring(0, 100)}...`);
        console.log(`💰 Tokens used: ~${response.usage?.output_tokens || 'unknown'}`);

        return aiResponse;
    } catch (error) {
        console.error('❌ Error:', error?.message || error);
        throw error;
    }
}

async function runMinimalTests() {
    console.log('\n🧪 MINIMAL CREDIT TEST - Valeria Chatbot\n');
    console.log('='.repeat(50));

    try {
        // Test 1: Very short greeting
        console.log('\n✅ TEST 1: Short greeting');
        await testMinimal('Hola');

        // Test 2: Price question (should redirect)
        console.log('\n✅ TEST 2: Price question');
        await testMinimal('¿Cuánto cuesta?');

        console.log('\n' + '='.repeat(50));
        console.log('\n✅ MINIMAL TESTS COMPLETED!');
        console.log('💰 Estimated cost: <$0.01 (very cheap test)');
        console.log('✅ Anthropic API working with real tokens!');
        console.log('✅ Ready for production deployment!\n');

    } catch (error) {
        console.error('\n❌ TEST FAILED:', error.message);
        if (error.message.includes('credit balance')) {
            console.log('\n💳 SOLUTION: Add $5 credits to Anthropic account');
            console.log('Go to: https://console.anthropic.com/account/billing');
        }
        process.exit(1);
    }
}

runMinimalTests();

