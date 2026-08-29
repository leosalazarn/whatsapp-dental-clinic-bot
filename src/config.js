// Configuration module — centralized env vars and constants
import 'dotenv/config';

// ── Validate required env vars at startup
const requiredEnvVars = [
    'ANTHROPIC_API_KEY', 'WA_ACCESS_TOKEN', 'WA_PHONE_NUMBER_ID', 'VERIFY_TOKEN', 'META_APP_SECRET',
    'BANK_HOLDER_NAME', 'BANK_HOLDER_CC',
    'BANCOLOMBIA_ACCOUNT', 'NEQUI_NUMBER', 'DAVIVIENDA_ACCOUNT',
    'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY',
    'CONSULTATION_PRICE', 'BOOK_PRICE', 'MIN_RANGE_PRICE', 'MAX_RANGE_PRICE',
    'DEBUG_API_KEY'
];
for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
        throw new Error(`❌ Missing required environment variable: ${envVar}`);
    }
}

// ── API Configuration
export const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
export const WA_ACCESS_TOKEN = process.env.WA_ACCESS_TOKEN;
export const WA_PHONE_NUMBER_ID = process.env.WA_PHONE_NUMBER_ID;
export const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
export const META_APP_SECRET = process.env.META_APP_SECRET;
export const PORT = process.env.PORT || 3000;
export const SUPABASE_URL = process.env.SUPABASE_URL;
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
export const DEBUG_API_KEY = process.env.DEBUG_API_KEY;

// ── Claude Configuration
export const CLASSIFIER_MAX_TOKENS = 50;

// ── Session Configuration
export const MAX_HISTORY = 10;
export const SESSION_EXPIRY_HOURS = 72;  // Keep sessions alive longer to handle re-engagement responses
export const CLEANUP_INTERVAL_MINUTES = 60;
export const REENGAGEMENT_DELAY_HOURS = 23;  // Send re-engagement after 23h of silence (keeps inside Meta's 24h free-form window)
export const REENGAGEMENT_DELAY_MINUTES = REENGAGEMENT_DELAY_HOURS * 60;

// ── Timezone
export const COLOMBIA_TIMEZONE = 'America/Bogota';

// ── Practice Info
export const PRACTICE_NAME = 'Your Dental Clinic';
export const PRACTICE_LOCATION = 'Your City, Country';
export const CONSULTATION_PRICE = Number(process.env.CONSULTATION_PRICE);
export const BOOK_PRICE = Number(process.env.BOOK_PRICE);
export const MIN_RANGE_PRICE = Number(process.env.MIN_RANGE_PRICE);
export const MAX_RANGE_PRICE = Number(process.env.MAX_RANGE_PRICE);
export const CONSULTATION_CURRENCY = 'Pesos';
export const CONSULTATION_DURATION_MINUTES = 30;

// All prices in COP. These are ranges — exact price depends on diagnosis.
export const TREATMENT_PRICES = {
    'default':                  { min: MIN_RANGE_PRICE,  max: MAX_RANGE_PRICE, note: 'varía según diagnóstico' },
};

// ── Banking Info
export const BANK_HOLDER_NAME = process.env.BANK_HOLDER_NAME;
export const BANK_HOLDER_CC = process.env.BANK_HOLDER_CC;
export const BANCOLOMBIA_ACCOUNT = process.env.BANCOLOMBIA_ACCOUNT;
export const NEQUI_NUMBER = process.env.NEQUI_NUMBER;
export const DAVIVIENDA_ACCOUNT = process.env.DAVIVIENDA_ACCOUNT;

// ── Model Router Configuration
export const MODEL_SIMPLE = 'claude-haiku-4-5-20251001';
export const MODEL_COMPLEX = 'claude-sonnet-4-6';
export const TOKENS_SIMPLE = 400;
export const TOKENS_COMPLEX = 700;
export const CLASSIFIER_LENGTH_THRESHOLD = 120;
export const COMPLEX_SIGNALS = [
    'duele', 'dolor', 'sangra', 'miedo', 'nervios',
    'precio', 'costo', 'cuánto', 'vale', 'cobran',
    'no puedo', 'no tengo', 'esperar', 'después',
    'seguro', 'garantía', 'qué pasa si',
    'otro', 'comparar', 'vi que',
];

// ── Flow & Safety Configuration
export const POSITIVE_RESPONSES = [
    'listo', 'sí', 'si', 'me convenciste', 'quiero agendar',
    'dale', 'claro', 'ok', 'okay', 'perfecto', 'bueno',
    'me interesa', 'quiero', 'vamos', 'agendemos', 'agendar',
    'de acuerdo', 'está bien', 'acepto', 'me animo', 'cuándo',
    'cuando', 'cómo agendo', 'como agendo'
];
export const MIN_EXCHANGES_FOR_HOOK = 3;
export const CONSENT_AFFIRMATIVE = [
    'sí', 'si', 'claro', 'acepto', 'ok', 'okay', 'dale', 'listo',
    'por supuesto', 'autorizo', 'yes'
];
export const DEBOUNCE_MS = 5000;
export const DEDUP_TTL_MS = 60 * 1000;
export const MAX_BUFFER_SIZE = 10;
export const CONVERSION_PHASES = ['START', 'CONSENT', 'EXTRACTION', 'HOOK', 'DATA_CAPTURE', 'PAYMENT', 'CLOSING'];

// ── Rate Limiting Configuration
export const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000;
export const DASHBOARD_RATE_LIMIT_MAX = Number(process.env.DASHBOARD_RATE_LIMIT_MAX) || 30;
// Generous ceiling for inbound webhooks: Meta sends from its own server IPs, not the
// end user's, so this must never block legitimate Meta traffic (defense-in-depth only).
export const WEBHOOK_RATE_LIMIT_MAX = Number(process.env.WEBHOOK_RATE_LIMIT_MAX) || 500;

// ── Hardcoded Messages (all user-facing text centralized here)
export const MSG_WELCOME = 'Hola, soy Valeria tu asistente, te hablamos de la clínica 🦷 ¿Con quién tengo el gusto?';

export const MSG_NON_TEXT = 'Por ahora solo puedo leer mensajes de texto 😊 ¿Me escribes lo que necesitas?';

export const MSG_REENGAGEMENT_HOOK = (name) =>
    `${name}, ¿te gustaría ver resultados de pacientes con un caso similar al tuyo? ✨`;

export const MSG_REENGAGEMENT_EXTRACTION = (name) =>
    `${name}, quedé pensando en lo que me contaste 🦷 ¿Pudiste resolver tus dudas? Aquí estamos para ayudarte.`;

export const MSG_REENGAGEMENT_DATA_CAPTURE = (name) =>
    `${name}, quedé pensando en lo que me contaste 🦷 ¿Pudiste resolver tus dudas? Aquí estamos para ayudarte.`;

export const MSG_HOOK = (name) =>
    `¡Qué bueno, ${name}! Nuestra doctora es especialista en eso 🌟\n` +
    `La valoración dura ${CONSULTATION_DURATION_MINUTES} min, incluye examen y plan — todo por $${CONSULTATION_PRICE.toLocaleString('es-CO')} que se abonan al tratamiento. ¿Agendamos?`;

export const MSG_DATA_CAPTURE = (aestheticGoal) => {
    const motivo = aestheticGoal
        ? `\n(Motivo de consulta ya lo tenemos: ${aestheticGoal} ✅ — solo confirma si es correcto)`
        : '\n• Motivo de consulta';
    return `¡Perfecto! Solo necesito un par de datos para reservar tu cita con nuestra doctora 😊\n\n• Nombre completo\n• Correo electrónico \n• ${motivo}`;
};

// Deterministic payment instructions — sent by the system, never generated by the AI.
// All values come from env vars. Centralized here so the AI cannot hallucinate them.
export const MSG_PAYMENT = () =>
`🦷☀️ Te dejo los datos para realizar el abono de $${BOOK_PRICE.toLocaleString('es-CO')} y confirmar tu cita de valoración presencial:

Bancolombia — Cta Ahorros
${BANK_HOLDER_NAME}
N° ${BANCOLOMBIA_ACCOUNT} · CC ${BANK_HOLDER_CC}

Nequi
N° ${NEQUI_NUMBER}

Davivienda — Cta Ahorros
${BANK_HOLDER_NAME}
N° ${DAVIVIENDA_ACCOUNT} · CC ${BANK_HOLDER_CC}

Cuando hagas el abono, envíame el comprobante aquí y confirmamos tu cita 🙌`;

// Deterministic first CLOSING message — sent by the system, never generated by the AI,
// so it can never invent a date/time (the AI has no calendar access).
export const MSG_CLOSING = (name) =>
    `Listo ${name}, en cuanto recibamos el comprobante nuestro equipo te confirma el horario 🙌 ¡Ya casi!`;

export const MSG_CLOSING_IN_PERSON = (name) =>
    `¡Perfecto${name ? `, ${name}` : ''}! 🙌 Tu valoración queda agendada. El pago lo realizas al inicio de tu cita directamente en la clínica. Muy pronto la recepcionista de la clínica te contactará para confirmar tu horario.`;

// Deterministic consent request (Ley 1581) — sent before collecting any PII.
// System message, never generated by the AI.
export const MSG_CONSENT = `Para coordinar tu cita, necesito guardar tu nombre completo, correo electrónico y motivo de consulta. ¿Nos autorizas a guardar esta información según la Ley 1581 de protección de datos?`;

export const MSG_CONSENT_DECLINED = `Entendido, respetamos tu decisión. Si cambias de opinión, escríbenos cuando quieras.`;

// Notification sent to the clinic receptionist when a lead reaches the PAYMENT phase.
// Contains only captured PII (name, goal, phone) — never banking details, never from logs.
export const MSG_RECEPTIONIST_ALERT = (name, goal, phone) =>
    `🦷 *Nueva valoración lista para agendar*\n\nPaciente: ${name || 'Sin nombre'}\nObjetivo: ${goal || 'Sin especificar'}\nWhatsApp: ${phone}\n\nYa recibió la información de pago. Por favor contáctale para confirmar el horario.`;

export const MSG_RECEPTIONIST_COMPROBANTE = (name, phone) =>
    `📎 *Comprobante recibido*\n\nPaciente: ${name || 'Sin nombre'}\nWhatsApp: ${phone}\n\nRevisa la transferencia en el banco y confirma la cita.`;

export const MSG_RECEPTIONIST_IN_PERSON = (name, phone) =>
    `🏥 *Pago en clínica*\n\nPaciente: ${name || 'Sin nombre'}\nWhatsApp: ${phone}\n\nEl paciente pagará directamente en la clínica. Contáctale para confirmar el horario.`;

// WhatsApp interactive consent buttons — used to send the Ley 1581 consent prompt as
// tap-to-respond buttons (graceful plain-text fallback via MSG_CONSENT on older clients).
export const CONSENT_BUTTONS = [
    { id: 'consent_yes', title: '✅ Sí, autorizo' },
    { id: 'consent_no',  title: '❌ No, gracias'  },
];

