// Intent extraction module — analyze conversation intent
import {upsertPatient} from './crm.js';
import log from './utils/logger.js';
import {formatColombiaTime} from './utils/time.js';

export function extractIntent(phone, response, session, classification = {}) {
    const intent = {
        phone,
        name: session.name,
        aesthetic_goal: session.aesthetic_goal,
        source: session.source || classification.source || 'ORGANIC',
        trigger_message: classification.trigger_message || null,
        intent: 'OTHER',
        phase: session.phase || 'START',
        requires_human: false,
        timestamp: formatColombiaTime(),
    };

    const lowerResponse = response.toLowerCase();

    // Extract name dynamically if AI signaled it
    const nameMatch = response.match(/NAME:\s*([^\n]+)/);
    if (nameMatch) intent.name = nameMatch[1].trim();

    // Extract aesthetic_goal dynamically if AI signaled it
    const goalMatch = response.match(/GOAL:\s*([^\n]+)/);
    if (goalMatch) intent.aesthetic_goal = goalMatch[1].trim();

    // Detect intent from response
    if (lowerResponse.includes('agendar') || lowerResponse.includes('semana') || lowerResponse.includes('disponibilidad')) {
        intent.intent = 'SCHEDULE';
        intent.requires_human = true;
    } else if (lowerResponse.includes('precio') || lowerResponse.includes('cuánto') || lowerResponse.includes('costo')) {
        intent.intent = 'PRICE_OBJECTION';
    } else if (lowerResponse.includes('miedo') || lowerResponse.includes('dolor') || lowerResponse.includes('ansiedad')) {
        intent.intent = 'FEAR_OBJECTION';
    } else if (lowerResponse.includes('pienso') || lowerResponse.includes('decidir') || lowerResponse.includes('duda')) {
        intent.intent = 'UNDECIDED';
    } else if (lowerResponse.includes('información') || lowerResponse.includes('saber más')) {
        intent.intent = 'REQUEST_INFO';
    }

    // Extract data if in DATA_CAPTURE phase
    if (session.phase === 'DATA_CAPTURE') {
        const extractedMatch = response.match(/EXTRACTED:\s*full_name:\s*([^,]+),\s*email:\s*([^,]+),\s*consultation_reason:\s*(.+)/);
        if (extractedMatch) {
            intent.full_name = extractedMatch[1].trim();
            intent.email = extractedMatch[2].trim();
            intent.consultation_reason = extractedMatch[3].trim();
            if (intent.full_name && intent.email && intent.consultation_reason) {
                intent.data_complete = true;
            }
        }
    }

    log.lead(intent);

    // Update patient in CRM
    upsertPatient({
        phone,
        name: intent.name || session.name,
        status: session.phase === 'CLOSING' ? 'CONSULTATION_SCHEDULED' : 'PROSPECT',
        aesthetic_goal: intent.aesthetic_goal || session.aesthetic_goal,
        source: intent.source,
        trigger_message: intent.trigger_message,
        last_intent: intent.intent,
        notes: `Intent: ${intent.intent} | Phase: ${intent.phase}`,
        full_name: intent.full_name,
        email: intent.email,
        consultation_reason: intent.consultation_reason,
        data_complete: intent.data_complete,
    });

    return intent;
}