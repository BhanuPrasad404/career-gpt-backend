import mongoose from "mongoose";
const UserSchema = new mongoose.Schema({
    fullname: {
        type: String,
        min: 2,
        max: 50,
    },
    email: {
        type: String,
        minLength: 2,
        maxLength: 50,
        unique: true,
        required: true
    },
    password: {
        type: String,
    },
    username: {
        type: String,
        min: 2,
        max: 30,
        unique: true,
        sparse: true
    },
    profilePicture: {
        type: String,
        default: ""
    },
    googleProfilePicture: {
        type: String, // URL from Google OAuth
        default: ""
    },
    plan: {
        type: String,
        enum: ['Free', 'Premium', 'Pro'],
        default: 'Free'
    },
    // OAuth fields
    authProvider: {
        type: String,
        enum: ['local', 'google', 'github'],
        default: 'local'
    },
    googleId: {
        type: String,
        default: ""
    },


    resetPasswordToken: {
        type: String,
        default: ""
    },
    resetPasswordExpiry: {
        type: Date,
        default: null
    },

    // Timestamps
    lastLogin: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true });

// Pre-save middleware to generate username from email if not provided
UserSchema.pre('save', function (next) {
    if (!this.username && this.email) {
        this.username = this.email.split('@')[0];
    }
    next();
});

const User = mongoose.model("User", UserSchema);
export default User;