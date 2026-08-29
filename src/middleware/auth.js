import {DEBUG_API_KEY} from '../config.js';

export function requireApiKey(req, res, next) {
    const apiKey = req.headers['x-api-key'];
    if (apiKey === DEBUG_API_KEY) {
        next();
    } else {
        res.status(401).json({error: 'Unauthorized — Invalid or missing x-api-key'});
    }
}
