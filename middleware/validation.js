// middleware/validation.js
import { body, param, validationResult } from 'express-validator';

// Validation rules
export const validateMessage = [
  body('userText')
    .notEmpty().withMessage('Message text is required')
    .isLength({ max: 4000 }).withMessage('Message too long (max 4000 chars)')
    .trim()
    .escape(), // Security: prevent XSS

  body('role')
    .isIn(['user', 'assistant']).withMessage('Invalid role'),

  body('connectionId')
    .optional()
    .isString().withMessage('Connection ID must be string')
];

export const validateChatId = [
  param('id')
    .isMongoId().withMessage('Invalid chat ID format')
];

export const validateTitle = [
  body('title')
    .notEmpty().withMessage('Title is required')
    .isLength({ min: 1, max: 100 }).withMessage('Title must be 1-100 characters')
    .trim()
    .escape()
];

// Validation middleware
export const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array()
    });
  }
  next();
};