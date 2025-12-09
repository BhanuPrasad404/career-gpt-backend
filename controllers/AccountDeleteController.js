import User from '../models/User.js';
import logger from '../utils/logger.js'; // ADD THIS

export const deleteAccount = async (req, res) => {
    try {
        const userId = req.user.id;

        logger.info('Deleting user account:', { userId });

        // First, delete user's profile picture from Cloudinary if exists
        const user = await User.findById(userId);
        if (user?.profilePicture) {
            try {
                // Extract public_id from Cloudinary URL
                const urlParts = user.profilePicture.split('/');
                const publicIdWithExtension = urlParts[urlParts.length - 1];
                const publicId = publicIdWithExtension.split('.')[0];
                const folder = 'synapsex/profile-pictures';
                const fullPublicId = `${folder}/${publicId}`;

                logger.info('Deleting profile picture from Cloudinary:', { publicId: fullPublicId });

                await cloudinary.uploader.destroy(fullPublicId);
                logger.info('Profile picture deleted from Cloudinary');
            } catch (cloudinaryError) {
                logger.error('Error deleting profile picture from Cloudinary:', cloudinaryError);
                // Continue with account deletion even if Cloudinary deletion fails
            }
        }

        // Delete all user's chats
        const Chat = require('../models/Chat.js'); // Import your Chat model
        await Chat.deleteMany({ userId });
        logger.info('All user chats deleted');

        // Delete the user account
        await User.findByIdAndDelete(userId);
        logger.info('User account deleted successfully');

        res.json({
            success: true,
            message: 'Account deleted successfully'
        });

    } catch (error) {
        logger.error('Account deletion failed:', error, { userId: req.user?.id });
        res.status(500).json({
            success: false,
            error: 'Account deletion failed: ' + error.message
        });
    }
};