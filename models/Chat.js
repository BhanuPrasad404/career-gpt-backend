import mongoose from "mongoose";
import User from "./User.js";

const FileSchema = new mongoose.Schema({
    filename: {
        type: String,
        required: true
    },
    mimeType: {
        type: String,
        required: true
    },
    size: {
        type: Number,
        required: true
    },
    fileType: {
        type: String,
        required: true
    },
    extractedText: {
        type: String,
        default: ""
    },
    cloudinaryUrl: {
        type: String,
        default: ""
    },
    cloudinaryPublicId: {
        type: String,
        default: ""
    },
    thumbnailUrl: {
        type: String,
        default: ""
    }
});

// Reaction Schema
const ReactionSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    type: {
        type: String,
        enum: ['like', 'dislike'],
        required: true
    },
    // Only for dislikes
    dislikeReason: {
        type: String,
        enum: ['inaccurate', 'irrelevant', 'unhelpful', 'too_short', 'too_long', 'other'],
        default: null
    },
    // For "other" reason
    customReason: {
        type: String,
        default: ''
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
}, { _id: false });

const MessageSchema = new mongoose.Schema({
    role: {
        type: String,
        required: true,
    },
    text: {
        type: String,
        required: true,
    },
    files: {
        type: [FileSchema],
        default: []
    },

    reactions: {
        type: [ReactionSchema],
        default: []
    },
    likeCount: {
        type: Number,
        default: 0
    },
    dislikeCount: {
        type: Number,
        default: 0
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

const ChatSchema = mongoose.Schema({
    userId: {
        type: String,
        ref: User,
        required: true,
    },
    title: {
        type: String,
        default: "Untitled Chat"
    },
    messages: [MessageSchema],
    messageCount: {
        type: Number,
        default: 0
    }
}, { timestamps: true });

MessageSchema.pre('save', function (next) {
    if (this.isModified('reactions')) {
        this.likeCount = this.reactions.filter(r => r.type === 'like').length;
        this.dislikeCount = this.reactions.filter(r => r.type === 'dislike').length;
    }
    next();
});

ChatSchema.pre('save', function (next) {
    this.messageCount = this.messages.length;
    next();
});

const Chat = mongoose.model("Chat", ChatSchema);
export default Chat;