// models/Resume.js
import mongoose from 'mongoose';

const criticalIssueSchema = new mongoose.Schema({
    issueId: { type: String, required: true },
    issue: { type: String, required: true },
    suggestion: { type: String, required: true },
    priority: { type: String, enum: ['high', 'medium', 'low'], required: true },
    section: { type: String } // which resume section has the issue
});

const strengthSchema = new mongoose.Schema({
    skill: { type: String, required: true },
    evidence: { type: String, required: true },
    relevance: { type: String, enum: ['high', 'medium', 'low'], required: true },
    impact: { type: String } // Quantifiable impact/metrics
});

const extractedSkillsSchema = new mongoose.Schema({
    technical: [String],
    soft: [String],
    tools: [String],
    certifications: [String], //Certifications found
    languages: [String] //Programming/human languages
});

const resumeMetadataSchema = new mongoose.Schema({
    //  New schema for enhanced analysis
    missingSections: [String],
    contactCompleteness: {
        email: { type: Boolean, default: false },
        phone: { type: Boolean, default: false },
        linkedin: { type: Boolean, default: false },
        portfolio: { type: Boolean, default: false }
    },
    achievementMetrics: { type: Number, default: 0 },
    careerProgression: {
        type: String,
        enum: ['accelerating', 'steady', 'stagnant', 'unclear'],
        default: 'unclear'
    },
    readabilityScore: { type: Number, min: 0, max: 100 } //Readability analysis
});

const aiAnalysisSchema = new mongoose.Schema({
    overallScore: { type: Number, required: true, min: 0, max: 100 },
    atsScore: { type: Number, required: true, min: 0, max: 100 },
    experienceLevel: { type: String, required: true },
    strengths: [strengthSchema],
    criticalIssues: [criticalIssueSchema],
    extractedSkills: extractedSkillsSchema, // Use enhanced schema
    suggestedRoles: [String],
    analyzedAt: { type: Date, required: true },
    resumeMetadata: resumeMetadataSchema //  Enhanced analysis data
});

const resumeSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    originalFileName: { type: String, required: true },
    cloudinaryUrl: { type: String, required: true },
    cloudinaryPublicId: { type: String, required: true },
    fileSize: { type: Number, required: true },
    parsedText: { type: String, required: true },
    textHash: { type: String, required: true },
    aiAnalysis: aiAnalysisSchema,
    version: { type: Number, default: 1 },
    isActive: { type: Boolean, default: true },
    uploadedAt: { type: Date, default: Date.now },
    analyzedAt: { type: Date },
    description: { type: String } // User can add notes about this resume version
});

// INDEXES
resumeSchema.index({ userId: 1 });
resumeSchema.index({ userId: 1, isActive: 1 });
resumeSchema.index({ uploadedAt: -1 });
resumeSchema.index({ 'aiAnalysis.overallScore': -1 }); //  For sorting by score

export default mongoose.model('Resume', resumeSchema);