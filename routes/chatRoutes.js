import express from "express";
import verifyToken from '../middleware/auth.js'
import {
  createChat,
  getAllChats,
  getChatById,
  addMessageToChat,
  deleteChat,
  updateChatWithMessage,
  stopGeneration,
  regenerateResponse,
  titleChange,
} from "../controllers/chatController.js";
import {
  chatMessageLimiter,
  generalLimiter
} from '../middleware/rateLimit.js';
import Chat from "../models/Chat.js";

const router = express.Router();

router.post('/:chatId/react-to/:messageId', verifyToken, generalLimiter, async (req, res) => {
  try {
    console.log('✅ Reaction API called:', req.params, req.body);

    const { chatId, messageId } = req.params;
    const { reactionType, dislikeReason, customReason } = req.body;
    const userId = req.user.id;

    // Validate reaction type
    if (!['like', 'dislike'].includes(reactionType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid reaction type'
      });
    }

    console.log('User ID:', userId, 'Reaction type:', reactionType);

    // For dislikes, validate reason
    let finalDislikeReason = null;
    let finalCustomReason = '';

    if (reactionType === 'dislike') {
      // Accept both frontend and backend formats
      const reasonMap = {
        'inaccurate': 'inaccurate',
        'Inaccurate': 'inaccurate',
        'not_helpful': 'unhelpful',
        'not helpful': 'unhelpful',
        'Not helpful': 'unhelpful',
        'unhelpful': 'unhelpful',
        'irrelevant': 'irrelevant',
        'Irrelevant': 'irrelevant',
        'too_vague': 'irrelevant',
        'Too vague': 'irrelevant',
        'too_short': 'too_short',
        'Too short': 'too_short',
        'too_long': 'too_long',
        'Too long': 'too_long',
        'other': 'other',
        'Other': 'other'
      };

      if (!dislikeReason || !reasonMap[dislikeReason]) {
        return res.status(400).json({
          success: false,
          error: 'Valid dislike reason is required'
        });
      }

      finalDislikeReason = reasonMap[dislikeReason];

      // For "other" reason, require custom text
      if (finalDislikeReason === 'other') {
        if (!customReason || customReason.trim().length < 3) {
          return res.status(400).json({
            success: false,
            error: 'Please explain why (minimum 3 characters)'
          });
        }
        finalCustomReason = customReason.trim();
      }
    }

    console.log('Looking for chat:', chatId);
    const chat = await Chat.findById(chatId);
    if (!chat) {
      console.log('❌ Chat not found:', chatId);
      return res.status(404).json({
        success: false,
        error: 'Chat not found'
      });
    }

    const message = chat.messages.id(messageId);
    if (!message) {
      console.log('❌ Message not found:', messageId);
      return res.status(404).json({
        success: false,
        error: 'Message not found'
      });
    }

    console.log('Message found, checking existing reactions...');

    // Check if user already reacted
    const existingReactionIndex = message.reactions.findIndex(
      r => r.userId.toString() === userId
    );

    if (existingReactionIndex > -1) {
      console.log('User already reacted, updating...');
      const existingReaction = message.reactions[existingReactionIndex];

      if (existingReaction.type === reactionType) {
        // Remove reaction if clicking same button again
        message.reactions.splice(existingReactionIndex, 1);
        console.log('Removed existing reaction');
      } else {
        // Change reaction type
        message.reactions[existingReactionIndex] = {
          userId,
          type: reactionType,
          dislikeReason: finalDislikeReason,
          customReason: finalCustomReason,
          createdAt: new Date()
        };
        console.log('Changed reaction type');
      }
    } else {
      // Add new reaction
      message.reactions.push({
        userId,
        type: reactionType,
        dislikeReason: finalDislikeReason,
        customReason: finalCustomReason
      });
      console.log('Added new reaction');
    }

    await chat.save();
    console.log('Chat saved successfully');

    // Get updated counts
    const updatedMessage = chat.messages.id(messageId);

    // Calculate counts manually (safer)
    const likeCount = updatedMessage.reactions.filter(r => r.type === 'like').length;
    const dislikeCount = updatedMessage.reactions.filter(r => r.type === 'dislike').length;

    const userReaction = updatedMessage.reactions.find(
      r => r.userId.toString() === userId
    );

    const responseData = {
      success: true,
      data: {
        messageId,
        likeCount,
        dislikeCount,
        userReaction: userReaction ? {
          type: userReaction.type,
          dislikeReason: userReaction.dislikeReason,
          customReason: userReaction.customReason
        } : null
      }
    };

    console.log('✅ Sending response:', responseData);
    res.json(responseData);

  } catch (error) {
    console.error('❌ Error adding reaction:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to add reaction'
    });
  }
});

router.post("/", verifyToken, generalLimiter, createChat);
router.get("/", verifyToken, generalLimiter, getAllChats);
router.get("/:id", verifyToken, generalLimiter, getChatById);
router.post("/:id/messages", verifyToken, chatMessageLimiter, addMessageToChat);
router.delete("/:id", verifyToken, generalLimiter, deleteChat)
router.patch('/:id', verifyToken, generalLimiter, updateChatWithMessage);
router.post('/:id/stop', verifyToken, generalLimiter, stopGeneration);
router.post('/:id/delete-response', verifyToken, generalLimiter, regenerateResponse);
router.patch('/:id/titleChange', verifyToken, generalLimiter, titleChange)

export default router;