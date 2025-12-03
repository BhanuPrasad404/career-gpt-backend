// routes/improvementRoutes.js
import express from 'express';
import {
    toggleGoal,
    getUserGoals,
    getResumeGoals,
    addCustomGoal,
    deleteGoal
} from '../controllers/improvementController.js';
import { improvementGoalsLimiter } from '../middleware/rateLimit.js';

import verifyToken from '../middleware/auth.js';

const router = express.Router();

router.patch('/goals/:goalId/toggle',
    verifyToken,
    improvementGoalsLimiter,
    toggleGoal
);

router.get('/goals',
    verifyToken,
    improvementGoalsLimiter,
    getUserGoals
);

router.get('/resumes/:resumeId/goals',
    verifyToken,
    improvementGoalsLimiter,
    getResumeGoals
);

router.post('/goals/custom',
    verifyToken,
    improvementGoalsLimiter,
    addCustomGoal
);

router.delete('/goals/:goalId',
    verifyToken,
    improvementGoalsLimiter,
    deleteGoal
);

export default router;