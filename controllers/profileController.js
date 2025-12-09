// controllers/profileController.js
import { cloudinary } from '../lib/cloudinary.js';
import User from '../models/User.js';
import Chat from '../models/Chat.js';
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger.js';

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const MAX_PROFILE_PIC_SIZE = 5 * 1024 * 1024; // 5MB

export const uploadProfilePicture = async (req, res) => {
    try {
        //Use req.file instead of req.files.file
        if (!req.file) {
            logger.warn('Profile picture upload failed - no file provided', {
                userId: req.user?.id
            });
            return res.status(400).json({
                success: false,
                error: 'No file selected'
            });
        }

        const file = req.file; //  req.file not req.files.file
        const userId = req.user.id;

        logger.info('Processing profile picture upload:', {
            userId,
            fileName: file.originalname, //originalname not name
            fileSize: file.size,
            mimeType: file.mimetype
        });

        // Validate it's an image
        if (!file.mimetype.startsWith('image/')) {
            logger.warn('Profile picture upload failed - not an image:', {
                userId,
                mimeType: file.mimetype
            });
            return res.status(400).json({
                success: false,
                error: 'Only image files are allowed for profile pictures'
            });
        }

        // Size limit for profile pictures (5MB is reasonable)
        if (file.size > MAX_PROFILE_PIC_SIZE) {
            logger.warn('Profile picture upload failed - file too large:', {
                userId,
                fileSize: file.size,
                maxSize: MAX_PROFILE_PIC_SIZE
            });
            return res.status(400).json({
                success: false,
                error: 'File too large. Maximum size is 5MB for profile pictures'
            });
        }

        // Use file.buffer instead of file.data
        const dataUri = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;

        logger.info('Uploading to Cloudinary:', {
            userId,
            folder: 'synapsex/profile-pictures'
        });

        // Upload to Cloudinary with profile-specific folder
        const uploadResult = await cloudinary.uploader.upload(dataUri, {
            folder: 'synapsex/profile-pictures',
            public_id: `profile_${userId}_${Date.now()}`,
            access_mode: 'public',
            resource_type: 'image',
            overwrite: true, // Overwrite previous profile picture
            transformation: [
                { width: 200, height: 200, crop: 'fill', gravity: 'face' } // Auto-crop to face
            ]
        });

        logger.info('Cloudinary upload successful:', {
            userId,
            cloudinaryUrl: uploadResult.secure_url
        });

        // Update user profile picture in database
        const updatedUser = await User.findByIdAndUpdate(
            userId,
            { profilePicture: uploadResult.secure_url },
            { new: true }
        );

        logger.info('User profile picture updated successfully:', {
            userId,
            profilePicture: uploadResult.secure_url
        });

        res.json({
            success: true,
            message: 'Profile picture uploaded successfully',
            profilePicture: uploadResult.secure_url,
            user: updatedUser
        });

    } catch (error) {
        logger.error('Profile picture upload failed:', error, {
            userId: req.user?.id,
            fileName: req.file?.originalname // MULTER FIX
        });
        res.status(500).json({
            success: false,
            error: 'Profile picture upload failed: ' + error.message
        });
    }
};

// uploadFile function still uses express-fileupload style
// If you want to use Multer for chat files too, you need a separate route
export const uploadFile = async (req, res) => {
    try {
        if (!req.file) {
            logger.warn('File upload failed - no file provided', { userId: req.user?.id });
            return res.status(400).json({ success: false, error: 'No file selected' });
        }
        const file = req.file;
        const userId = req.user.id;
        const { chatId, messageId } = req.body;

        logger.info('Processing file upload', {
            userId,
            fileName: file.originalname, // CHANGED: file.name → file.originalname
            fileSize: file.size,
            mimeType: file.mimetype,
            chatId: chatId || 'none',
            messageId: messageId || 'none'
        });

        if (file.size > MAX_FILE_SIZE) {
            logger.warn('File upload failed - file too large', {
                userId,
                fileSize: file.size,
                maxSize: MAX_FILE_SIZE
            });
            return res.status(400).json({
                success: false,
                error: 'File too large. Maximum size is 50MB'
            });
        }

        const documentMimeTypes = [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-powerpoint',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'text/plain',
            'application/zip',
            'application/x-rar-compressed'
        ];

        const resourceType = documentMimeTypes.includes(file.mimetype)
            ? 'raw'
            : file.mimetype.startsWith('image/')
                ? 'image'
                : 'auto';

        const dataUri = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;

        logger.info('Uploading to Cloudinary', {
            userId,
            resourceType,
            folder: 'synapsex/chat-files'
        });

        const uploadResult = await cloudinary.uploader.upload(dataUri, {
            folder: `synapsex/chat-files/${userId}`,
            public_id: `file_${uuidv4()}_${file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_')}`, // CHANGED: file.name → file.originalname
            access_mode: 'public',
            resource_type: resourceType,
            overwrite: false,
        });

        logger.info('Cloudinary upload successful', {
            userId,
            fileId: uploadResult.public_id,
            fileName: file.originalname, // CHANGED: file.name → file.originalname
            fileSize: file.size,
            cloudinaryUrl: uploadResult.secure_url,
            resourceType: uploadResult.resource_type
        });

        const fileData = {
            filename: file.originalname, // CHANGED: file.name → file.originalname
            mimeType: file.mimetype,
            size: file.size,
            fileType: getFileType(file.mimetype),
            extractedText: '', // Will be populated later if needed
            cloudinaryUrl: uploadResult.secure_url,
            cloudinaryPublicId: uploadResult.public_id,
            thumbnailUrl: uploadResult.resource_type === 'image' ? uploadResult.secure_url : ''
        };

        if (chatId && messageId) {
            await Chat.findOneAndUpdate(
                {
                    _id: chatId,
                    userId: userId,
                    'messages._id': messageId
                },
                {
                    $push: {
                        'messages.$.files': fileData
                    }
                },
                {
                    new: true
                }
            );

            logger.info('Chat updated with file', {
                chatId,
                messageId,
                fileName: file.originalname, // CHANGED: file.name → file.originalname
                fileId: uploadResult.public_id
            });
        }

        res.json({
            success: true,
            message: 'File uploaded successfully',
            file: fileData
        });

    } catch (error) {
        logger.error('File upload operation failed', error, {
            userId: req.user?.id,
            fileName: req.file?.originalname,
            fileSize: req.file?.size
        });
        res.status(500).json({
            success: false,
            error: 'File upload failed: ' + error.message
        });
    }
};

const getFileType = (mimeType) => {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.includes('pdf')) return 'pdf';
    if (mimeType.includes('document') || mimeType.includes('text')) return 'document';
    if (mimeType.includes('video')) return 'video';
    if (mimeType.includes('audio')) return 'audio';
    if (mimeType.includes('zip') || mimeType.includes('rar')) return 'archive';
    return 'other';
};

export const deleteFile = async (req, res) => {
    try {
        const { publicId } = req.body;
        const userId = req.user.id;

        logger.info('Deleting file from Cloudinary', { publicId, userId });

        const result = await cloudinary.uploader.destroy(publicId);

        // Also remove from any chat messages
        await Chat.updateMany(
            { userId: userId },
            { $pull: { 'messages.$[].files': { cloudinaryPublicId: publicId } } }
        );

        res.json({
            success: true,
            message: 'File deleted successfully',
            result
        });

    } catch (error) {
        logger.error('File deletion failed:', error);
        res.status(500).json({
            success: false,
            error: 'File deletion failed: ' + error.message
        });
    }
};

export const updateProfile = async (req, res) => {
    try {
        const userId = req.user.id;
        const { fullname, username, email } = req.body;

        logger.info('Updating user profile:', { userId, fullname, username, email });

        // Check if username is taken by another user
        if (username) {
            const existingUser = await User.findOne({
                username,
                _id: { $ne: userId }
            });
            if (existingUser) {
                return res.status(400).json({
                    success: false,
                    error: 'Username already taken'
                });
            }
        }

        const updatedUser = await User.findByIdAndUpdate(
            userId,
            {
                fullname,
                username,
                email,
                updatedAt: new Date()
            },
            { new: true }
        ).select('-password'); // Don't return password

        logger.info('Profile updated successfully:', { userId });

        res.json({
            success: true,
            message: 'Profile updated successfully',
            user: updatedUser
        });

    } catch (error) {
        logger.error('Profile update failed:', error, { userId: req.user?.id });
        res.status(500).json({
            success: false,
            error: 'Profile update failed: ' + error.message
        });
    }
};

export const getProfile = async (req, res) => {
    try {
        const userId = req.user.id;

        logger.info('Fetching user profile:', { userId });

        const user = await User.findById(userId).select('-password');

        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        logger.info('Profile fetched successfully:', { userId });

        res.json({
            success: true,
            user
        });

    } catch (error) {
        logger.error('Get profile failed:', error, { userId: req.user?.id });
        res.status(500).json({
            success: false,
            error: 'Failed to fetch profile: ' + error.message
        });
    }
};

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