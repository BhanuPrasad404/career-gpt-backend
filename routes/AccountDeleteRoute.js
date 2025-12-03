import express from 'express';
import { uploadProfilePicture, updateProfile, getProfile, deleteAccount } from '../controllers/profileController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// Existing routes
router.get('/', protect, getProfile);
router.put('/', protect, updateProfile);
router.post('/upload-profile-picture', protect, uploadProfilePicture);

// New delete account route
router.delete('/', protect, deleteAccount);

export default router;