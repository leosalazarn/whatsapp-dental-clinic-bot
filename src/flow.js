// Conversion flow module — orchestrates message processing pipeline (shorter messages)
import {
    getSession,
    addMessageToHistory,
    updateSession,
    recordPhase,
    recordFirstResponse,
    recordRouting,
} from './session.js';
import {scheduleReengagement, cancelReengagement} from './reengagement.js';
import {buildSystemPrompt, buildCurrentPatientPrompt} from './prompt.js';
import {classifyMessage} from './classifier.js';
import {callValeria} from './ai.js';
import {routeMessage} from './model-router.js';
import {sendMessage, sendInteractiveButtons, sendReceptionistAlert, notifyReceptionist} from './whatsapp.js';
import {auditOutput} from './guardrails/output.js';
import {extractIntent} from './intent.js';
import {upsertPatient, findPatient} from './crm.js';
import {getColombiaNow} from './utils/time.js';
import {
    REENGAGEMENT_DELAY_MINUTES,
    MSG_REENGAGEMENT_HOOK,
    MSG_REENGAGEMENT_EXTRACTION,
    MSG_REENGAGEMENT_DATA_CAPTURE,
    MSG_HOOK, MSG_DATA_CAPTURE, MSG_PAYMENT, MSG_CLOSING, MSG_CLOSING_IN_PERSON,
    MSG_WELCOME, MSG_CONSENT, MSG_CONSENT_DECLINED,
    MSG_RECEPTIONIST_COMPROBANTE, MSG_RECEPTIONIST_IN_PERSON,
    CONSENT_BUTTONS,
    POSITIVE_RESPONSES, CONSENT_AFFIRMATIVE,
    MIN_EXCHANGES_FOR_HOOK
} from './config.js';
import log from './utils/logger.js';

// Strip internal signals before sending to patient
export function stripSignals(text) {
    return text
        .replace(/\nNAME:.*$/gm, '')
        .replace(/\nGOAL:.*$/gm, '')
        .replace(/\nEXTRACTED:.*$/gm, '')
        .trim();
}

// Dispatch a conversion-flow response. Interactive button prompts use the WhatsApp interactive
// API; plain strings use the text API. An interactive failure degrades gracefully to plain text.
async function dispatchResponse(phone, response) {
    if (response?.kind === 'interactive_buttons') {
        try {
            await sendInteractiveButtons(phone, response.body, response.buttons);
        } catch (err) {
            log.error('sendInteractiveButtons failed — falling back to plain text', err);
            await sendMessage(phone, response.body);
        }
    } else if (typeof response === 'string') {
        await sendMessage(phone, response);
    }
}

export async function processMessage(phone, text, chatType) {
    try {
        // Get or initialize session
        const session = await getSession(phone);

        // Add user message to history
        await addMessageToHistory(phone, 'user', text);
        const currentMessageCount = (session.message_count || 0) + 1;
        await updateSession(phone, {message_count: currentMessageCount});

        log.incoming(phone, text);

        // Classification
        const classification = await classifyMessage(phone, text, chatType);

        if (classification.action === 'IGNORE') {
            log.groupIgnored(phone);
            return;
        }

        // Set session source from classification
        await updateSession(phone, {source: classification.source});

        // Handle conversion flow for new leads — pass text for intent detection
        if (classification.action === 'WARM_LEAD' || classification.action === 'ORGANIC_LEAD') {
            const updatedSession = await getSession(phone); // Get updated count
            const conversionResponse = await handleConversionFlow(phone, updatedSession, text);
            if (conversionResponse) {
                await dispatchResponse(phone, conversionResponse);
                const outgoingText = typeof conversionResponse === 'string' ? conversionResponse : conversionResponse.body;
                await addMessageToHistory(phone, 'assistant', outgoingText);
                await recordFirstResponse(phone);
                await resetReengagementTimer(phone, updatedSession);
                extractIntent(phone, outgoingText, updatedSession, classification);
                return;
            }
        }

        // Build appropriate system prompt
        let systemPrompt;
        if (classification.action === 'CURRENT_PATIENT') {
            systemPrompt = buildCurrentPatientPrompt();
        } else {
            systemPrompt = buildSystemPrompt(session);
        }

        // Route to appropriate model then call Claude
        const {model, maxTokens, route, layer} = await routeMessage(text, session.phase, session);
        const {text: aiResponse, input_tokens, output_tokens} = await callValeria(session.history, systemPrompt, model, maxTokens);

        // [RESENT_DATA] — patient in CLOSING asks to resend payment details (AI-emitted token).
        // Send the deterministic payment template directly: bypasses the bank-data guardrail,
        // which only permits banking details inside the PAYMENT phase (this message is ours,
        // not AI-generated, so it is safe).
        if (session.phase === 'CLOSING' && aiResponse.includes('[RESENT_DATA]')) {
            const resent = MSG_PAYMENT();
            await addMessageToHistory(phone, 'assistant', resent);
            await sendMessage(phone, resent);
            await recordFirstResponse(phone);
            await resetReengagementTimer(phone, session);
            log.outgoing(phone, resent.length);
            return;
        }

        // Add AI response to history
        await addMessageToHistory(phone, 'assistant', aiResponse);

        const modelKey = route === 'COMPLEX' ? 'sonnet' : 'haiku';
        await recordRouting(phone, { layer, route, modelKey, input_tokens, output_tokens });

        // Extract intent and update CRM
        const intent = extractIntent(phone, aiResponse, session, classification);

        // Update session data from intent
        await updateSession(phone, {
            name: intent.name || session.name,
            aesthetic_goal: intent.aesthetic_goal || session.aesthetic_goal,
            full_name: intent.full_name || session.full_name,
            email: intent.email || session.email,
            consultation_reason: intent.consultation_reason || session.consultation_reason,
            data_complete: intent.data_complete || session.data_complete,
        });

        // Strip internal signals before sending to patient
        const cleanResponse = stripSignals(aiResponse);

        // Output guardrails — block bank data leaks outside PAYMENT phase
        const audit = auditOutput(cleanResponse, session.phase);
        if (!audit.safe) {
            log.warn('BLOCKED_RESPONSE', `Reason: ${audit.reason} | Phone: ${phone}`);
            await sendMessage(phone, audit.text);
            return;
        }

        // Reset reengagement timer on every outgoing message — covers all phases
        await resetReengagementTimer(phone, session);
        await recordFirstResponse(phone);
        log.outgoing(phone, audit.text.length);
        await sendMessage(phone, audit.text);

    } catch (error) {
        log.error('processMessage', error);
    }
}

// Universal reengagement reset — fires after every outgoing message in any phase
async function resetReengagementTimer(phone, session) {
    const s = await getSession(phone);
    const name = s?.name || '';
    const phase = s?.phase || 'EXTRACTION';

    let msg;
    if (phase === 'DATA_CAPTURE') {
        msg = MSG_REENGAGEMENT_DATA_CAPTURE(name);
    } else if (phase === 'HOOK') {
        msg = MSG_REENGAGEMENT_HOOK(name);
    } else {
        msg = MSG_REENGAGEMENT_EXTRACTION(name);
    }

    if (s?.metrics) s.metrics.reengagement_sent = true;

    // Cancel-then-schedule makes it resettable (only the last one fires) and durable:
    // reengagement.js persists the follow-up and its poller sends it even across restarts.
    await cancelReengagement(phone);
    await scheduleReengagement(phone, msg, phase, REENGAGEMENT_DELAY_MINUTES * 60 * 1000);
}

// Conversion flow phases
export async function handleConversionFlow(phone, session, text = '') {
    const phase = session.phase || 'START';
    const textLower = text.toLowerCase();
    const isPositive = POSITIVE_RESPONSES.some(word => textLower.includes(word));

    // START → EXTRACTION: a new contact enters the conversation freely so they can ask
    // commercial questions (prices, treatments) before any data is collected. Ley 1581
    // consent is requested at the DATA_CAPTURE entry, not here.
    if (phase === 'START') {
        await updateSession(phone, {phase: 'EXTRACTION'});
        await recordPhase(phone, 'EXTRACTION');
        return null; // Let the AI handle this turn normally
    }

    // Handle the CONSENT phase: wait for an explicit affirmative before advancing.
    if (phase === 'CONSENT') {
        if (text === 'consent_yes' || CONSENT_AFFIRMATIVE.some(word => textLower.includes(word))) {
            const now = getColombiaNow();
            await updateSession(phone, {
                phase: 'DATA_CAPTURE',
                consent_given: true,
                consent_given_at: now,
            });
            await recordPhase(phone, 'DATA_CAPTURE');
            await upsertPatient({phone, consent_given: true, consent_given_at: now});
            return null; // Consent granted — let the AI handle this turn normally
        }
        if (text === 'consent_no') {
            // Explicit button refusal
            return MSG_CONSENT_DECLINED;
        }
        // Patient typed free text on an older client — re-send the buttons rather than
        // assuming a refusal.
        return { kind: 'interactive_buttons', body: MSG_CONSENT, buttons: CONSENT_BUTTONS };
    }

    // Phase A: Data extraction — AI handles naturally until name + goal are known
    if (!session.name || !session.aesthetic_goal) {
        await updateSession(phone, {phase: 'EXTRACTION'});
        await recordPhase(phone, 'EXTRACTION');
        return null;
    }

    // Phase B: Hook delivery — requires min X exchanges to avoid premature pitch
    if (phase === 'EXTRACTION' && (session.message_count || 0) >= MIN_EXCHANGES_FOR_HOOK) {
        await updateSession(phone, {phase: 'HOOK'});
        await recordPhase(phone, 'HOOK');
        return MSG_HOOK(session.name);
    }

    // Still in EXTRACTION but not enough exchanges yet — let AI keep talking
    if (phase === 'EXTRACTION') {
        return null;
    }

    // Phase C: Data capture — only triggers when patient responds positively to the hook.
    // Ley 1581 gate: consent must be granted before we collect PII; if not yet given, divert
    // to CONSENT and resume DATA_CAPTURE after the affirmative reply.
    if (phase === 'HOOK' && isPositive) {
        const patient = await findPatient(phone);
        if (!patient?.consent_given) {
            await updateSession(phone, {phase: 'CONSENT'});
            await recordPhase(phone, 'CONSENT');
            return { kind: 'interactive_buttons', body: MSG_CONSENT, buttons: CONSENT_BUTTONS }; // Do NOT call the AI on this turn
        }
        await updateSession(phone, {phase: 'DATA_CAPTURE'});
        await recordPhase(phone, 'DATA_CAPTURE');
        const s = await getSession(phone);
        if (s?.metrics?.reengagement_sent) s.metrics.reengagement_recovered = true;
        return MSG_DATA_CAPTURE(session.aesthetic_goal);
    }

    // Phase D: Payment — only advance when data is fully captured
    if (phase === 'DATA_CAPTURE') {
        if (session.data_complete) {
            await updateSession(phone, {phase: 'PAYMENT'});
            await recordPhase(phone, 'PAYMENT');
        }
        return null;
    }

    // Phase E: Payment
    if (phase === 'PAYMENT') {
        const patient = await findPatient(phone);
        const patientName = patient?.name ?? session?.name ?? null;

        // First contact: send the deterministic payment template (no AI involved).
        if (!session.payment_info_sent) {
            await updateSession(phone, {payment_info_sent: true});

            // Notify receptionist — fire-and-forget, never blocks patient response
            sendReceptionistAlert(session.name, session.aesthetic_goal, phone).catch((err) => {
                log.error('sendReceptionistAlert failed', err?.message);
            });

            return MSG_PAYMENT();   // deterministic — banking details never AI-generated
        }

        // [COMPROBANTE_SENT] — patient sent a payment receipt (image/document) instead of text
        if (text === '[COMPROBANTE_SENT]') {
            const confirmMsg = '¡Recibimos tu comprobante 📎 La recepcionista lo revisará y te confirmará el horario muy pronto!';
            notifyReceptionist(MSG_RECEPTIONIST_COMPROBANTE(patientName, phone)).catch(err =>
                log.error('receptionist comprobante alert failed', err?.message));
            return confirmMsg;
        }

        // Follow-up: let the AI handle questions and emit deterministic signal tokens.
        const systemPrompt = buildSystemPrompt(session);
        const {model, maxTokens} = await routeMessage(text, 'PAYMENT', session);
        const {text: aiResponse} = await callValeria(session.history, systemPrompt, model, maxTokens);

        // [IN_PERSON_PAYMENT] — patient cannot / prefers not to transfer electronically
        if (aiResponse.includes('[IN_PERSON_PAYMENT]')) {
            await updateSession(phone, {phase: 'CLOSING', in_person_payment: true});
            await recordPhase(phone, 'CLOSING');
            notifyReceptionist(MSG_RECEPTIONIST_IN_PERSON(patientName, phone)).catch(err =>
                log.error('receptionist in-person alert failed', err?.message));
            return MSG_CLOSING_IN_PERSON(patientName);
        }

        // [RESENT_DATA] — patient asks for the payment details to be resent
        if (aiResponse.includes('[RESENT_DATA]')) {
            return MSG_PAYMENT();
        }

        // No signal token: advance to CLOSING with the standard confirmation.
        await updateSession(phone, {phase: 'CLOSING'});
        await recordPhase(phone, 'CLOSING');
        return MSG_CLOSING(patientName ?? session.name);
    }

    return null; // Let AI handle all other cases
}