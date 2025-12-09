// routes/profileRoute.js
import express from 'express';
import verifyToken from '../middleware/auth.js';

// Import the profile controllers
import {
    updateProfile,
    uploadProfilePicture,
    getProfile,
    deleteAccount,
    uploadFile
} from '../controllers/profileController.js';
import { profilePicUpload, upload } from '../middleware/uploadMiddleware.js';

const router = express.Router();

// @route   PUT /api/profile/update
// @desc    Update user profile
// @access  Private
router.put('/update', verifyToken, updateProfile);

// @route   POST /api/profile/upload-picture
// @desc    Upload profile picture
// @access  Private
router.post('/upload-picture', verifyToken, profilePicUpload.single('profilePicture'), uploadProfilePicture);
router.post('/', verifyToken, upload.single('file'), uploadFile);


// @route   GET /api/profile
// @desc    Get user profile
// @access  Private
router.get('/', verifyToken, getProfile);

router.delete('/', verifyToken, deleteAccount);

export default router;