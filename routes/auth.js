import express, { Router } from 'express';
import { login, register, forgotPassword, resetPassword } from '../controllers/auth.js';
import { authLimiter } from '../middleware/rateLimit.js';

const router = express.Router();

router.post('/register',
    authLimiter, // 5 requests per 15 minutes
    register
);

router.post('/login',
    authLimiter, // 5 requests per 15 minutes
    login
);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

export default router;