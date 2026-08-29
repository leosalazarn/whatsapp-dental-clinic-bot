// Time utility module — Colombia timezone helpers
import {COLOMBIA_TIMEZONE} from '../config.js';

export function getColombiaNow() {
    return new Date().toISOString();
}

export function formatColombiaTime() {
    return new Date().toLocaleString('es-CO', {timeZone: COLOMBIA_TIMEZONE});
}

export function isoToColombiaTime(isoString) {
    const date = new Date(isoString);
    return date.toLocaleString('es-CO', {timeZone: COLOMBIA_TIMEZONE});
}

