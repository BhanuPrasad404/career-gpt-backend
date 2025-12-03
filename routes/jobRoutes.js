// routes/jobRoutes.js
import express from 'express';
import {
    createJobApplication,
    updateApplicationStatus,
    trackAIPrep,
    getUserApplications,
    deleteJobApplication
} from '../controllers/jobController.js';
import {
    jobMatchingLimiter,
    generalLimiter
} from '../middleware/rateLimit.js';
import verifyToken from '../middleware/auth.js';

const router = express.Router();

router.post('/applications',
    verifyToken,
    jobMatchingLimiter,
    createJobApplication
);

router.patch('/applications/:applicationId/status',

    verifyToken,
    generalLimiter,
    updateApplicationStatus
);

router.patch('/applications/:applicationId/track-prep',
    verifyToken,
    generalLimiter,
    trackAIPrep
);

router.get('/applications',
    verifyToken,
    generalLimiter,
    getUserApplications
);

router.delete('/applications/:applicationId', verifyToken, generalLimiter, deleteJobApplication);

export default router;