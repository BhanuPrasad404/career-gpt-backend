import express from "express";
import { deleteRoadmap } from "../controllers/roadMapSaveController.js";
import { roadMapSaveController } from "../controllers/roadMapSaveController.js";
import verifyToken from "../middleware/auth.js"
import { getRoadmap } from "../controllers/roadMapSaveController.js";

const router = express.Router();

router.post('/', verifyToken, roadMapSaveController)
router.get('/', verifyToken, getRoadmap)
router.delete('/:id', verifyToken, deleteRoadmap)
export default router;