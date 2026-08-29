// Logger module — centralized console output with emoji prefixes
const log = {
    incoming: (phone, text) => {
        console.log(`📩 [${phone}] (${text.length} chars)`);
    },

    outgoing: (phone, textLength) => {
        console.log(`✉️ Valeria → [${phone}] (${textLength} chars)`);
    },

    lead: (intentJson) => {
        const safe = {
            phase: intentJson?.phase,
            source: intentJson?.source,
        };
        console.log(`📊 LEAD:`, JSON.stringify(safe, null, 2));
    },

    trigger: (phone, triggerMessage) => {
        // triggerMessage is always a hardcoded keyword constant — never user-controlled input
        console.log(`🎯 Trigger detected: "${triggerMessage}" [${phone}]`); // lgtm[js/clear-text-logging]
    },

    error: (context, error) => {
        console.error(`❌ ${context}:`, error?.message || error);
    },

    warn: (context, msg) => {
        console.warn(`⚠️ ${context}:`, msg);
    },

    info: (msg) => {
        console.log(`ℹ️ ${msg}`);
    },

    success: (msg) => {
        console.log(`✅ ${msg}`);
    },

    reengagement: (phone) => {
        console.log(`⏰ Reengagement sent to ${phone}`);
    },

    groupIgnored: (phone) => {
        console.log(`🚫 Ignoring group message from ${phone}`);
    },

    supplierIgnored: (phone) => {
        console.log(`⚠️ Supplier message ignored: ${phone}`);
    },
};

export default log;
