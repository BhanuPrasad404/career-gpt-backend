import Notification from '../models/Notification.js';
import JobApplication from '../models/JobApplication.js';
import cron from 'node-cron';
import logger from '../utils/logger.js';
import { sendNotification } from '../server/socket.js';

class NotificationService {
    static async sendInterviewReminders() {
        try {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);

            const upcomingInterviews = await JobApplication.find({
                status: 'interview',
                interviewDate: {
                    $gte: tomorrow,
                    $lt: new Date(tomorrow.getTime() + 24 * 60 * 60 * 1000)
                },
                reminderSent: { $ne: true }
            }).populate('userId');

            for (const app of upcomingInterviews) {
                // CREATE notification object FIRST
                const notification = {
                    userId: app.userId._id,
                    type: 'interview_reminder',
                    title: `🎯 Interview Tomorrow!`,
                    message: `Interview with ${app.job.company} for ${app.job.role} is tomorrow.`,
                    data: {
                        applicationId: app._id,
                        company: app.job.company,
                        role: app.job.role,
                        interviewDate: app.interviewDate
                    }
                };

                // Save to database
                await Notification.create(notification);

                // Mark as sent
                app.reminderSent = true;
                await app.save();

                // Send real-time via Socket.io
                sendNotification(app.userId._id, notification);

                logger.info(`Sent reminder for ${app.job.company}`);
            }

            return { success: true, count: upcomingInterviews.length };
        } catch (error) {
            logger.error('Reminder error:', error);
            return { success: false, error: error.message };
        }
    }

    static async sendJobMatchNotification(userId, applicationId, matchScore) {
        try {
            const app = await JobApplication.findById(applicationId);

            if (matchScore > 50) {
                // CREATE notification object
                const notification = {
                    userId,
                    type: 'job_match',
                    title: `🎉 Great Match!`,
                    message: `${matchScore}% match with ${app.job.company}. Consider applying!`,
                    data: {
                        applicationId,
                        company: app.job.company,
                        role: app.job.role,
                        matchScore
                    }
                };

                // Save to database
                await Notification.create(notification);

                // Send real-time
                sendNotification(userId, notification);
            }

            return { success: true };
        } catch (error) {
            logger.error('Job match notification error:', error);
            return { success: false, error: error.message };
        }
    }
}

// Start cron job
cron.schedule('0 9 * * *', () => {
    logger.info('Running daily interview reminders...');
    NotificationService.sendInterviewReminders();
});

export default NotificationService;