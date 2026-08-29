// Classifier module — pre-processing message classification rules
import {findPatient} from './crm.js';
import {getSession} from './session.js';
import log from './utils/logger.js';

export async function classifyMessage(phone, text, chatType) {
    // RULE 1: Ignore group messages
    if (chatType === 'group') {
        return {action: 'IGNORE', reason: 'group_message'};
    }

    // RULE 2: Returning patient in active treatment
    const patient = await findPatient(phone);
    if (patient && patient.status === 'IN_TREATMENT') {
        return {action: 'CURRENT_PATIENT', reason: 'in_treatment'};
    }

    // RULE 3: Active session — conversation already in progress
    const session = await getSession(phone);
    if (session && session.phase && session.phase !== 'START') {
        return {action: 'ORGANIC_LEAD', reason: 'active_session', source: 'ORGANIC'};
    }

    // RULE 4: Any new individual contact — treat as potential lead
    log.trigger(phone, 'new_contact');
    return {action: 'WARM_LEAD', reason: 'new_contact', source: 'DIRECT'};
}