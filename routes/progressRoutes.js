// routes/progressRoutes.js
import express from "express";
import { getProgress, updateMilestone } from "../controllers/progressController.js";
import verifyToken from "../middleware/auth.js"

const router = express.Router();

router.get("/:roadmapId", verifyToken, getProgress); // GET saved progress
router.put("/:roadmapId/milestone", verifyToken, updateMilestone); // PUT single or bulk

export default router;
