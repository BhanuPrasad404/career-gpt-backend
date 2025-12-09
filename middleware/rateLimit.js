// middleware/rateLimit.js
import rateLimit from 'express-rate-limit';

// General API rate limit
export const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: {
        error: 'Too many requests, please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// Strict limit for chat messages (prevent spam)
export const chatMessageLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 10, // Max 10 messages per minute
    message: {
        error: 'Too many messages sent, please slow down.'
    },
    skipSuccessfulRequests: false,
});

// Auth endpoint limits
export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Max 5 login attempts per windowMs
    message: {
        error: 'Too many authentication attempts, please try again later.'
    },
    skipSuccessfulRequests: true,
});

// Resume Analysis - Strict (costly AI calls)
export const resumeAnalysisLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Max 3 resume analyses per 15 minutes
    message: {
        error: 'Too many resume analyses. Please wait 15 minutes before analyzing another resume.'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// File Uploads - Moderate
export const fileUploadLimiter = rateLimit({
    windowMs: 10 * 60 * 1000, // 10 minutes
    max: 5, // Max 5 file uploads per 10 minutes
    message: {
        error: 'Too many file uploads. Please wait 10 minutes.'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// Job Matching - Moderate (AI calls)
export const jobMatchingLimiter = rateLimit({
    windowMs: 10 * 60 * 1000, // 10 minutes
    max: 5, // Max 5 job matches per 10 minutes
    message: {
        error: 'Too many job matches. Please wait 10 minutes.'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// Improvement Goals - Lenient
export const improvementGoalsLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 20, // Max 20 goal updates per 5 minutes
    message: {
        error: 'Too many goal updates. Please wait 5 minutes.'
    },
    standardHeaders: true,
    legacyHeaders: false,
});