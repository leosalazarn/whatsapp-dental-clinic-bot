export class AppError extends Error {
    constructor(message, context = {}) {
        super(message);
        this.name = 'AppError';
        this.context = context;
    }
}

export class NotFoundError extends AppError {
    constructor(resource, id) {
        super(`${resource} not found: ${id}`, {resource, id});
        this.name = 'NotFoundError';
        this.statusCode = 404;
    }
}

export class ValidationError extends AppError {
    constructor(field, message) {
        super(`Validation error: ${field} — ${message}`, {field});
        this.name = 'ValidationError';
        this.statusCode = 400;
    }
}

export function handleError(err, log) {
    log.error(err.name || 'AppError', err.message);
    if (err.context) log.error('Context', JSON.stringify(err.context));
}
