import RoadMap from "../models/RoadMap.js";
import logger from '../utils/logger.js'; 

//Save Roadmap
export const roadMapSaveController = async (req, res) => {
  try {
    const { formData, roadmap, metadata } = req.body;

    if (!formData) {
      return res.status(400).json({
        success: false,
        message: "formData is required",
      });
    }

    const newRoadmap = new RoadMap({
      userId: req.user.id, // coming from verifyToken
      formData: {
        name: formData.name || "",
        current_status: formData.current_status || "",
        interests: formData.interests || "",
        goals: formData.goals || "",
        time_per_week: formData.time_per_week || "",
        learning_style: formData.learning_style || "",
        tech_experience: formData.tech_experience || "",
      },
      roadmap: roadmap || { phases: [] },
      metadata: {
        ...metadata,
        createdAt: new Date(),
      },
    });

    const saveRoadMap = await newRoadmap.save();
    res.json({
      success: true,
      roadmapId: saveRoadMap._id,
      message: "Roadmap saved successfully",
    });
  } catch (error) {
    logger.error("saving to database failed", error); 
    res.status(500).json({
      success: false,
      message: "Failed to save roadmap",
    });
  }
};

//Get All Roadmaps for logged-in user
export const getRoadmap = async (req, res) => {
  try {
    const roadmaps = await RoadMap.find({ userId: req.user.id });
    res.json({ success: true, roadmaps });
  } catch (error) {
    logger.error("fetching roadmaps failed", error); 
    res.status(500).json({
      success: false,
      message: "Failed to fetch roadmaps",
    });
  }
};

// Delete Roadmap
export const deleteRoadmap = async (req, res) => {
  try {
    const { id } = req.params;

    const roadmap = await RoadMap.findOneAndDelete({
      _id: id,
      userId: req.user.id, // ensure user owns this roadmap
    });

    if (!roadmap) {
      return res.status(404).json({
        success: false,
        message: "Roadmap not found or not authorized",
      });
    }

    res.json({
      success: true,
      message: "Roadmap deleted successfully",
    });
  } catch (error) {
    logger.error("deleting roadmap failed", error); 
    res.status(500).json({
      success: false,
      message: "Failed to delete roadmap",
    });
  }
};