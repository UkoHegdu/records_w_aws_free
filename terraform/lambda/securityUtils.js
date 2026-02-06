// lambda/securityUtils.js - Security utilities for input sanitization and validation

// Input sanitization functions
const sanitizeString = (input, maxLength = 255) => {
    if (!input || typeof input !== 'string') return '';

    return input
        .trim()
        .slice(0, maxLength)
        .replace(/[<>\"'&]/g, (match) => {
            const entities = {
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#x27;',
                '&': '&amp;'
            };
            return entities[match];
        });
};

const sanitizeEmail = (email) => {
    if (!email || typeof email !== 'string' || email.trim() === '') return '';

    const sanitized = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    return emailRegex.test(sanitized) ? sanitized : '';
};

const sanitizeUsername = (username) => {
    if (!username || typeof username !== 'string' || username.trim() === '') return '';

    return username
        .trim()
        .replace(/[^a-zA-Z0-9_-]/g, '') // Only allow alphanumeric, underscore, hyphen
        .slice(0, 50);
};

const sanitizeMapUid = (mapUid) => {
    if (!mapUid || typeof mapUid !== 'string' || mapUid.trim() === '') return '';

    return mapUid
        .trim()
        .replace(/[^a-zA-Z0-9_-]/g, '') // Only allow alphanumeric, underscore, hyphen
        .slice(0, 100);
};

// Input validation functions
const validateEmail = (email) => {
    if (!email || email.trim() === '') return false;
    const sanitized = sanitizeEmail(email);
    return sanitized.length > 0;
};

const validatePassword = (password) => {
    if (!password || typeof password !== 'string') return false;

    // Password requirements: 6+ chars (relaxed for existing users)
    return password.length >= 6;
};

const validateUsername = (username) => {
    if (!username || username.trim() === '') return false;
    const sanitized = sanitizeUsername(username);
    return sanitized.length >= 3 && sanitized.length <= 50;
};

const validateMapUid = (mapUid) => {
    if (!mapUid || mapUid.trim() === '') return false;
    const sanitized = sanitizeMapUid(mapUid);
    return sanitized.length > 0;
};

// Rate limiting helper (simple in-memory store)
const rateLimitStore = new Map();

const checkRateLimit = (identifier, maxRequests = 10, windowMs = 60000) => {
    const now = Date.now();
    const windowStart = now - windowMs;

    if (!rateLimitStore.has(identifier)) {
        rateLimitStore.set(identifier, []);
    }

    const requests = rateLimitStore.get(identifier);

    // Remove old requests outside the window
    const validRequests = requests.filter(timestamp => timestamp > windowStart);

    if (validRequests.length >= maxRequests) {
        return false; // Rate limit exceeded
    }

    // Add current request
    validRequests.push(now);
    rateLimitStore.set(identifier, validRequests);

    return true; // Request allowed
};

// SQL injection detection
const detectSQLInjection = (input) => {
    if (!input || typeof input !== 'string') return false;

    const sqlPatterns = [
        /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION|SCRIPT)\b)/i,
        /(;|\-\-|\/\*|\*\/)/,
        /(\b(OR|AND)\s+\d+\s*=\s*\d+)/i,
        /(\bUNION\s+SELECT\b)/i,
        /(\bDROP\s+TABLE\b)/i
    ];

    return sqlPatterns.some(pattern => pattern.test(input));
};

// XSS detection
const detectXSS = (input) => {
    if (!input || typeof input !== 'string') return false;

    const xssPatterns = [
        /<script[^>]*>.*?<\/script\s*>/gi,
        /<iframe[^>]*>.*?<\/iframe\s*>/gi,
        /javascript:/gi,
        /on\w+\s*=/gi,
        /<[^>]*>/gi
    ];

    return xssPatterns.some(pattern => pattern.test(input));
};

// Comprehensive input validation
const validateAndSanitizeInput = (input, type, options = {}) => {
    const {
        maxLength = 255,
        required = true,
        allowEmpty = false
    } = options;

    // Handle null/undefined
    if (!input && !required) return { isValid: true, sanitized: '' };
    if (!input && required) return { isValid: false, sanitized: '', error: 'Required field missing' };

    // Handle empty strings
    if (input === '' && !required) return { isValid: true, sanitized: '' };
    if (input === '' && required) return { isValid: false, sanitized: '', error: 'Required field missing' };

    // Check for malicious patterns first (only if input is not empty)
    if (input && input.trim().length > 0) {
        if (detectSQLInjection(input)) {
            return { isValid: false, sanitized: '', error: 'Invalid input detected' };
        }

        if (detectXSS(input)) {
            return { isValid: false, sanitized: '', error: 'Invalid input detected' };
        }
    }

    let sanitized;
    let isValid;

    switch (type) {
        case 'email':
            sanitized = sanitizeEmail(input);
            isValid = validateEmail(input);
            break;
        case 'username':
            sanitized = sanitizeUsername(input);
            isValid = validateUsername(input);
            break;
        case 'password':
            isValid = validatePassword(input);
            sanitized = input; // Don't sanitize passwords
            break;
        case 'mapUid':
            sanitized = sanitizeMapUid(input);
            isValid = validateMapUid(input);
            break;
        case 'string':
        default:
            sanitized = sanitizeString(input, maxLength);
            isValid = sanitized.length > 0 || allowEmpty;
            break;
    }

    return {
        isValid,
        sanitized,
        error: isValid ? null : `Invalid ${type} format`
    };
};

module.exports = {
    sanitizeString,
    sanitizeEmail,
    sanitizeUsername,
    sanitizeMapUid,
    validateEmail,
    validatePassword,
    validateUsername,
    validateMapUid,
    checkRateLimit,
    detectSQLInjection,
    detectXSS,
    validateAndSanitizeInput
};