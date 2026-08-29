// WhatsApp module — Meta API integration for sending messages
import {WA_PHONE_NUMBER_ID, WA_ACCESS_TOKEN, MSG_RECEPTIONIST_ALERT} from './config.js';
import log from './utils/logger.js';

export async function sendMessage(to, text) {
    const url = `https://graph.facebook.com/v19.0/${WA_PHONE_NUMBER_ID}/messages`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${WA_ACCESS_TOKEN}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to,
                type: 'text',
                text: {
                    preview_url: false,
                    body: text,
                },
            }),
        });

        if (!response.ok) {
            const error = await response.json();
            log.error('WhatsApp API error', error);
        }
    } catch (error) {
        log.error('sendMessage', error);
    }
}

// Send an interactive button message (Meta Cloud API type: "interactive"). Reuses the same
// endpoint and auth header as sendMessage. Throws on failure so callers can fall back to plain text.
export async function sendInteractiveButtons(to, bodyText, buttons) {
    const url = `https://graph.facebook.com/v19.0/${WA_PHONE_NUMBER_ID}/messages`;

    const interactiveButtons = buttons.map(b => ({
        type: 'reply',
        reply: { id: b.id, title: b.title },
    }));

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${WA_ACCESS_TOKEN}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to,
                type: 'interactive',
                interactive: {
                    type: 'button',
                    body: { text: bodyText },
                    action: { buttons: interactiveButtons },
                },
            }),
        });

        if (!response.ok) {
            const error = await response.json();
            log.error('WhatsApp API error', error);
            throw error;
        }
    } catch (error) {
        log.error('sendInteractiveButtons', error);
        throw error;
    }
}

/**
 * Sends a plain-text WhatsApp notification to the clinic receptionist.
 * No-op (logs warning) when RECEPTIONIST_PHONE is not configured.
 */
export async function sendReceptionistAlert(patientName, aestheticGoal, patientPhone) {
    const receptionistPhone = process.env.RECEPTIONIST_PHONE;
    if (!receptionistPhone) {
        console.warn('⚠️ RECEPTIONIST_PHONE not configured — skipping receptionist alert');
        return;
    }
    const text = MSG_RECEPTIONIST_ALERT(patientName, aestheticGoal, patientPhone);
    await sendMessage(receptionistPhone, text);
}

/**
 * Sends an arbitrary plain-text notification to the clinic receptionist.
 * No-op (logs warning) when RECEPTIONIST_PHONE is not configured.
 */
export async function notifyReceptionist(text) {
    const receptionistPhone = process.env.RECEPTIONIST_PHONE;
    if (!receptionistPhone) {
        console.warn('⚠️ RECEPTIONIST_PHONE not configured — skipping receptionist notification');
        return;
    }
    await sendMessage(receptionistPhone, text);
}

