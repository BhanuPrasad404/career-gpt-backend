// NEW - Career roadmap with 6 features
import mongoose from "mongoose";
import User from "./User.js";
const RoadMapSchema = new mongoose.Schema({
    userId: {
        type: String,
        ref: User,
        required: true,
    },
    formData: {
        name: String,
        current_status: String,
        interests: String,
        goals: String,
        time_per_week: String,
        learning_style: String,
        tech_experience: String,
        currentSkills: [String],
    },

    // 6 CAREER FEATURES
    careerPath: {
        timeline: String, // "18 months"
        phases: [{
            name: String, // "Months 1-3: Advanced Frontend"
            description: String,
            focus: String, // "Master React Ecosystem"
            milestones: [String], // ["Learn React Hooks", "Build Projects"]
            skillsToLearn: [String], // ["React", "Redux", "Testing"]
            projects: [String], // ["E-commerce App", "Admin Dashboard"]
            duration: String // "3 months"
        }]
    },

    skillGaps: {
        currentSkills: [String], // ["React", "JavaScript"]
        requiredSkills: [String], // ["Node.js", "MongoDB"]
        missingSkills: [String], // ["Node.js", "System Design"]
        prioritySkills: [String], // ["Node.js", "Backend Fundamentals"]
        matchPercentage: Number // 45
    },

    salaryGrowth: {
        current: Number, // 8 (LPA)
        target: Number, // 25
        currency: { type: String, default: 'INR' },
        unit: { type: String, default: 'LPA' },
        progression: [{
            timeline: String, // "6 months", "1 year", "2 years"
            amount: Number, // 12, 18, 25
            role: String, // "Mid-level", "Senior", "Lead"
            description: String //  Added description for each step
        }],
        growthPercentage: Number, // 212
        marketInsights: String, // Added market insights
        recommendedCities: [{ // Added city recommendations
            city: String,
            multiplier: Number,
            description: String
        }],
        growthStrategy: { //Added growth strategy
            skill: String,
            projects: String,
            networking: String,
            certifications: String,
            interview: String
        }
    },

    roleTransition: {
        steps: [{
            step: Number,
            title: String,
            description: String,
            duration: String,
            tasks: [String],
            status: { type: String, default: 'upcoming' } // current/completed/upcoming
        }],
        totalDuration: String, // "12-18 months"
        successRate: String // "85%"
    },

    learningPath: {
        resources: [{
            name: { type: String, default: "" },
            url: { type: String, default: "" },
            type: { type: String, default: "" },
            duration: { type: String, default: "" },
            difficulty: { type: String, default: "" },
            phase: { type: String, default: "" },
            completed: { type: Boolean, default: false }
        }],
        progress: { type: Number, default: 0 }
    },

    progressTracker: {
        overall: { type: Number, default: 0 },
        careerPath: {
            completed: { type: Number, default: 0 },
            total: { type: Number, default: 0 },
            percentage: { type: Number, default: 0 }
        },
        learningPath: {
            completed: { type: Number, default: 0 },
            total: { type: Number, default: 0 },
            percentage: { type: Number, default: 0 }
        },
        roleTransition: {
            completed: { type: Number, default: 0 },
            total: { type: Number, default: 0 },
            percentage: { type: Number, default: 0 }
        },
        skillGaps: {
            completed: { type: Number, default: 0 },
            total: { type: Number, default: 0 },
            percentage: { type: Number, default: 0 }
        },
        lastUpdated: { type: Date, default: Date.now }
    },
    completedMilestones: {
        type: Map,
        of: Boolean,
        default: new Map()
    },

    metadata: {
        createdAt: { type: Date, default: Date.now },
        aiModel: { type: String, default: 'gemini-pro' },
        version: { type: String, default: '2.0' }
    }
}, { timestamps: true });

RoadMapSchema.methods.calculateAllProgress = function () {
    console.log("🎯 CALCULATEALLPROGRESS METHOD EXECUTING!");
    const roadmap = this;

    // Helper to count completed items by prefix
    const countCompletedByPrefix = (prefix) => {
        let count = 0;
        for (const [key, value] of roadmap.completedMilestones) {
            if (key.startsWith(prefix) && value === true) {
                count++;
            }
        }
        console.log(`📈 ${prefix}: ${count} completed`);
        return count;
    };

    // Calculate totals from actual data
    roadmap.progressTracker.careerPath.total = roadmap.careerPath?.phases?.reduce((sum, phase) =>
        sum + (phase.milestones?.length || 0), 0) || 0;

    roadmap.progressTracker.learningPath.total = roadmap.learningPath?.resources?.length || 0;

    roadmap.progressTracker.roleTransition.total = roadmap.roleTransition?.steps?.reduce((sum, step) =>
        sum + (step.tasks?.length || 0), 0) || 0;

    roadmap.progressTracker.skillGaps.total = roadmap.skillGaps?.requiredSkills?.length || 0;

    // Count completed items
    roadmap.progressTracker.careerPath.completed = countCompletedByPrefix('career-');
    roadmap.progressTracker.learningPath.completed = countCompletedByPrefix('learning-');
    roadmap.progressTracker.roleTransition.completed = countCompletedByPrefix('step-');
    roadmap.progressTracker.skillGaps.completed = countCompletedByPrefix('skill-');

    // Calculate percentages (avoid division by zero)
    const calculatePercentage = (completed, total) => {
        return total > 0 ? Math.round((completed / total) * 100) : 0;
    };

    roadmap.progressTracker.careerPath.percentage = calculatePercentage(
        roadmap.progressTracker.careerPath.completed,
        roadmap.progressTracker.careerPath.total
    );

    roadmap.progressTracker.learningPath.percentage = calculatePercentage(
        roadmap.progressTracker.learningPath.completed,
        roadmap.progressTracker.learningPath.total
    );

    roadmap.progressTracker.roleTransition.percentage = calculatePercentage(
        roadmap.progressTracker.roleTransition.completed,
        roadmap.progressTracker.roleTransition.total
    );

    roadmap.progressTracker.skillGaps.percentage = calculatePercentage(
        roadmap.progressTracker.skillGaps.completed,
        roadmap.progressTracker.skillGaps.total
    );

    // Calculate overall progress (average of all features)
    const percentages = [
        roadmap.progressTracker.careerPath.percentage,
        roadmap.progressTracker.learningPath.percentage,
        roadmap.progressTracker.roleTransition.percentage,
        roadmap.progressTracker.skillGaps.percentage
    ].filter(p => p > 0);

    roadmap.progressTracker.overall = percentages.length > 0
        ? Math.round(percentages.reduce((a, b) => a + b, 0) / percentages.length)
        : 0;

    roadmap.progressTracker.lastUpdated = new Date();

    console.log(" FINAL PROGRESS:", roadmap.progressTracker);

    return roadmap.save();
};

const RoadMap = mongoose.model("RoadMap", RoadMapSchema);
export default RoadMap;