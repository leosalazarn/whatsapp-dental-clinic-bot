/**
 * @typedef {'START'|'EXTRACTION'|'HOOK'|'DATA_CAPTURE'|'PAYMENT'|'CLOSING'} Phase
 */

/**
 * @typedef {'IGNORE'|'CURRENT_PATIENT'|'ORGANIC_LEAD'|'WARM_LEAD'} ClassificationAction
 */

/**
 * @typedef {'SCHEDULE'|'PRICE_OBJECTION'|'FEAR_OBJECTION'|'UNDECIDED'|'REQUEST_INFO'|'OTHER'} IntentType
 */

/**
 * @typedef {'NEW'|'PROSPECT'|'IN_TREATMENT'|'CONSULTATION_SCHEDULED'} PatientStatus
 */

/**
 * @typedef {'DIRECT'|'ORGANIC'} LeadSource
 */

/**
 * @typedef {Object} SessionMetrics
 * @property {string} first_contact - ISO timestamp
 * @property {number|null} first_response_ms
 * @property {boolean} reengagement_sent
 * @property {boolean} reengagement_recovered
 * @property {Object<string, string|null>} phase_timestamps
 */

/**
 * @typedef {Object} Session
 * @property {Array<{role: string, content: string}>} history
 * @property {string|null} name
 * @property {string|null} aesthetic_goal
 * @property {Phase} phase
 * @property {LeadSource} source
 * @property {string|null} trigger_message
 * @property {number|null} reengagement_timer
 * @property {string} last_interaction
 * @property {string|null} full_name
 * @property {string|null} email
 * @property {string|null} consultation_reason
 * @property {boolean} data_complete
 * @property {number} message_count
 * @property {boolean} payment_info_sent
 * @property {SessionMetrics} metrics
 */

/**
 * @typedef {Object} Patient
 * @property {string} phone
 * @property {string|null} name
 * @property {string|null} full_name
 * @property {string|null} email
 * @property {string|null} consultation_reason
 * @property {PatientStatus} status
 * @property {string|null} aesthetic_goal
 * @property {LeadSource} source
 * @property {string|null} trigger_message
 * @property {boolean} data_complete
 * @property {IntentType} last_intent
 * @property {string} notes
 * @property {string} first_contact
 * @property {string} last_interaction
 */

/**
 * @typedef {Object} ClassificationResult
 * @property {ClassificationAction} action
 * @property {string} reason
 * @property {LeadSource} [source]
 * @property {string} [trigger_message]
 */
