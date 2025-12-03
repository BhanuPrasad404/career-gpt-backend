import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    type: {
        type: String,
        enum: ['interview_reminder', 'job_match', 'weekly_summary'],
        required: true
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    data: {
        applicationId: mongoose.Schema.Types.ObjectId,
        company: String,
        role: String,
        matchScore: Number,
        interviewDate: Date
    },
    read: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

notificationSchema.index({ userId: 1, read: 1 });
notificationSchema.index({ createdAt: 1 });

export default mongoose.model('Notification', notificationSchema);