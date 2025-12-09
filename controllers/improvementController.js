// controllers/improvementController.js
import ImprovementGoal from '../models/ImprovementGoal.js';
import Resume from '../models/Resume.js';
import logger from '../utils/logger.js'; 

// TOGGLE GOAL CHECKBOX
const toggleGoal = async (req, res) => {
    try {
        const { goalId } = req.params;
        const { checked } = req.body;

        const goal = await ImprovementGoal.findOne({
            _id: goalId,
            userId: req.user.id
        });

        if (!goal) {
            return res.status(404).json({
                success: false,
                message: 'Improvement goal not found'
            });
        }

        goal.checked = checked;
        goal.checkedAt = checked ? new Date() : null;
        await goal.save();

        res.json({
            success: true,
            message: `Goal ${checked ? 'checked' : 'unchecked'} successfully`,
            data: goal
        });

    } catch (error) {
        logger.error('Toggle goal error:', error); // CHANGED
        res.status(500).json({
            success: false,
            message: 'Error updating goal',
            error: error.message
        });
    }
};

const getUserGoals = async (req, res) => {
    try {
        const goals = await ImprovementGoal.find({
            userId: req.user.id
        }).populate('resumeId', 'aiAnalysis version uploadedAt');

        const totalGoals = goals.length;
        const completedGoals = goals.filter(goal => goal.checked).length;
        const progressPercentage = totalGoals > 0 ? Math.round((completedGoals / totalGoals) * 100) : 0;

        res.json({
            success: true,
            data: {
                goals,
                progress: {
                    total: totalGoals,
                    completed: completedGoals,
                    percentage: progressPercentage
                }
            }
        });

    } catch (error) {
        logger.error('Get goals error:', error); // CHANGED
        res.status(500).json({
            success: false,
            message: 'Error fetching goals',
            error: error.message
        });
    }
};

const getResumeGoals = async (req, res) => {
    try {
        const { resumeId } = req.params;

        const goals = await ImprovementGoal.find({
            userId: req.user.id,
            resumeId: resumeId
        });

        res.json({
            success: true,
            data: goals
        });

    } catch (error) {
        logger.error('Get resume goals error:', error); // CHANGED
        res.status(500).json({
            success: false,
            message: 'Error fetching resume goals',
            error: error.message
        });
    }
};

const addCustomGoal = async (req, res) => {
    try {
        const { description, suggestion, priority } = req.body;

        const activeResume = await Resume.findOne({
            userId: req.user.id,
            isActive: true
        });

        if (!activeResume) {
            return res.status(404).json({
                success: false,
                message: 'No active resume found'
            });
        }

        const customGoal = await ImprovementGoal.create({
            userId: req.user.id,
            resumeId: activeResume._id,
            issueId: `custom_${Date.now()}`,
            description,
            suggestion,
            priority: priority || 'medium',
            isCustom: true
        });

        res.status(201).json({
            success: true,
            message: 'Custom goal added successfully',
            data: customGoal
        });

    } catch (error) {
        logger.error('Add custom goal error:', error); // CHANGED
        res.status(500).json({
            success: false,
            message: 'Error adding custom goal',
            error: error.message
        });
    }
};

// controllers/improvementController.js
const deleteGoal = async (req, res) => {
    try {
        const { goalId } = req.params;

        logger.info('Deleting goal:', { goalId, userId: req.user.id }); // CHANGED

        const goal = await ImprovementGoal.findOneAndDelete({
            _id: goalId,
            userId: req.user.id
        });

        if (!goal) {
            return res.status(404).json({
                success: false,
                message: 'Improvement goal not found'
            });
        }

        logger.info('Goal deleted successfully:', goalId); // CHANGED

        res.json({
            success: true,
            message: 'Goal deleted successfully',
            deletedGoal: goal
        });

    } catch (error) {
        logger.error('Delete goal error:', error); // CHANGED
        res.status(500).json({
            success: false,
            message: 'Error deleting goal',
            error: error.message
        });
    }
};

export {
    toggleGoal,
    getUserGoals,
    getResumeGoals,
    addCustomGoal,
    deleteGoal
};