// models/JobApplication.js
import mongoose from 'mongoose';

const jobSchema = new mongoose.Schema({
    company: { type: String, required: true },
    role: { type: String, required: true },
    jobDescription: { type: String, required: true },
    salary: { type: String }
});

// models/JobApplication.js 
const matchAnalysisSchema = new mongoose.Schema({
    matchScore: { type: Number, required: true, min: 0, max: 100 },
    matchingSkills: [String],
    missingSkills: [String],
    weaknesses: [String],
    strengths: [String],
    suggestions: [String],
    confidence: { type: Number, min: 0, max: 100 },
    scoreBreakdown: [{
        category: String,
        score: Number,
        weight: Number,
        details: [String]
    }],
    analyzedAt: { type: Date, required: true }
});

const jobApplicationSchema = new mongoose.Schema({
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
    job: jobSchema,
    status: {
        type: String,
        enum: ['applied', 'interview', 'offer', 'rejected', 'accepted'],
        default: 'applied'
    },
    appliedDate: { type: Date, default: Date.now },
    interviewDate: { type: Date },
    matchAnalysis: matchAnalysisSchema,
    aiPrepUsed: { type: Boolean, default: false },
    lastPrepAt: { type: Date },
    reminderSent: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// INDEXES
jobApplicationSchema.index({ userId: 1 });
jobApplicationSchema.index({ userId: 1, status: 1 });
jobApplicationSchema.index({ userId: 1, createdAt: -1 });

jobApplicationSchema.pre('save', function (next) {
    this.updatedAt = Date.now();
    next();
});


export default mongoose.model('JobApplication', jobApplicationSchema);