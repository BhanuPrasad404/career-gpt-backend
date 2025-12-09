// models/ImprovementGoal.js
import mongoose from 'mongoose';

const improvementGoalSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    resumeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Resume',
        required: true
    },
    issueId: { type: String, required: true },
    description: { type: String, required: true },
    suggestion: { type: String, required: true },
    priority: { type: String, enum: ['high', 'medium', 'low'], required: true },
    checked: { type: Boolean, default: false },
    checkedAt: { type: Date },
    createdAt: { type: Date, default: Date.now }
});

// INDEXES
improvementGoalSchema.index({ userId: 1, resumeId: 1 });
improvementGoalSchema.index({ userId: 1, checked: 1 });


export default mongoose.model('ImprovementGoal', improvementGoalSchema);