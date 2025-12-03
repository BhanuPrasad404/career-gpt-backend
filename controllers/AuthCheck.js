// routes/auth.js
import express from 'express';
import verifyToken from '../middleware/auth.js'; // Your existing middleware

const router = express.Router();

// Add this verification endpoint
router.get('/', verifyToken, (req, res) => {
    // If middleware passes, token is valid
    res.status(200).json({
        valid: true,
        message: 'Token is valid',
        user: req.user //  return user info
    });
});

export default router;