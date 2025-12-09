// routes/resumeRoutes.js
import express from 'express';
import { uploadResume, getResumeAnalysis, getUserResumes, getResumeById, deleteResume } from '../controllers/resumeController.js';
import upload, { handleUploadError } from '../middleware/uploadMiddleware.js'; // Import error handler
import {
    resumeAnalysisLimiter,
    fileUploadLimiter
} from '../middleware/rateLimit.js';

import verifyToken from '../middleware/auth.js';
const router = express.Router();

router.post('/upload',
    verifyToken,
    fileUploadLimiter,
    upload.single('resume'),
    handleUploadError,
    uploadResume
);

router.get('/analysis',
    verifyToken,
    resumeAnalysisLimiter,
    getResumeAnalysis
);

router.get('/',
    verifyToken,
    getUserResumes
);
router.get('/:resumeId', verifyToken, getResumeById);
router.delete('/:resumeId', verifyToken, deleteResume);

export default router;