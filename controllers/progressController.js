// controllers/progressController.js
import RoadMap from "../models/RoadMap.js";
import logger from '../utils/logger.js';

/**
 * GET /api/progress/:roadmapId
 * Returns the completedMilestones map (as plain object)
 */
export const getProgress = async (req, res) => {
    try {
        const { roadmapId } = req.params;
        logger.info(" GET PROGRESS CALLED FOR:", roadmapId);

        const roadmap = await RoadMap.findById(roadmapId);
        logger.info(" ROADMAP FOUND:", roadmap ? "YES" : "NO");

        if (!roadmap) {
            logger.warn("ROADMAP NOT FOUND");
            return res.status(404).json({ message: "Roadmap not found" });
        }

        logger.info(" CALCULATING PROGRESS...");
        await roadmap.calculateAllProgress();
        logger.info(" PROGRESS CALCULATED");

        const milestones = roadmap.completedMilestones
            ? Object.fromEntries(roadmap.completedMilestones)
            : {};

        logger.info(" RETURNING PROGRESS DATA");
        return res.json({
            completedMilestones: milestones,
            progressTracker: roadmap.progressTracker
        });
    } catch (err) {
        logger.error(" GET PROGRESS ERROR:", err);
        logger.error(" ERROR STACK:", err.stack);
        logger.error(" ERROR DETAILS:", {
            message: err.message,
            name: err.name,
            roadmapId: roadmapId
        });
        return res.status(500).json({ message: "Server error" });
    }
};

/**
 * PUT /api/progress/:roadmapId/milestone
 * Body: { key: "0-2", value: true } OR { bulk: { "0-1": true, "0-2": false } }
 */
export const updateMilestone = async (req, res) => {
    try {
        const { roadmapId } = req.params;
        const { key, value, bulk } = req.body;

        logger.info(" UPDATE MILESTONE CALLED:", { roadmapId, key, value, bulk });

        const roadmap = await RoadMap.findById(roadmapId);
        if (!roadmap) {
            logger.warn(" ROADMAP NOT FOUND");
            return res.status(404).json({ message: "Roadmap not found" });
        }

        // Ensure completedMilestones exists as a Map
        if (!roadmap.completedMilestones) {
            logger.info(" INITIALIZING COMPLETED MILESTONES MAP");
            roadmap.completedMilestones = new Map();
        }

        if (bulk && typeof bulk === "object") {
            logger.info(" PROCESSING BULK UPDATE:", Object.keys(bulk).length, "items");
            Object.entries(bulk).forEach(([k, v]) => {
                roadmap.completedMilestones.set(k, !!v);
            });
        } else if (typeof key === "string") {
            logger.info(" PROCESSING SINGLE UPDATE:", key, "->", value);
            roadmap.completedMilestones.set(key, !!value);
        } else {
            logger.warn(" INVALID REQUEST BODY");
            return res.status(400).json({ message: "Invalid body. Provide key+value or bulk." });
        }

        logger.info("CALCULATING PROGRESS AFTER UPDATE...");
        await roadmap.calculateAllProgress();
        logger.info(" PROGRESS UPDATED");

        // Return the updated data
        const milestonesObj = Object.fromEntries(roadmap.completedMilestones);
        return res.json({
            success: true,
            completedMilestones: milestonesObj,
            progressTracker: roadmap.progressTracker
        });
    } catch (err) {
        logger.error(" UPDATE MILESTONE ERROR:", err);
        logger.error(" ERROR STACK:", err.stack);
        logger.error(" ERROR DETAILS:", {
            message: err.message,
            name: err.name,
            roadmapId: roadmapId,
            body: req.body
        });
        return res.status(500).json({ message: "Server error" });
    }
};