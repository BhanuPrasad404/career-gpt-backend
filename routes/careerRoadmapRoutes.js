// routes/careerRoadmapRoutes.js
import express from 'express';
import CareerRoadmapController from '../controllers/careerRoadmapController.js';
import verifyToken from '../middleware/auth.js';

const router = express.Router();

// Apply auth middleware to all routes
router.use(verifyToken);
// Generate new career roadmap
router.post('/generate', CareerRoadmapController.generateCareerRoadmap);

// Get specific roadmap
router.get('/:roadmapId', CareerRoadmapController.getCareerRoadmap);

// Get all user's roadmaps
router.get('/', CareerRoadmapController.getUserRoadmaps);

// Update progress
router.patch('/:roadmapId/progress', CareerRoadmapController.updateProgress);

router.delete('/:roadmapId', CareerRoadmapController.deleteCareerRoadmap);

export default router;