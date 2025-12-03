import { OAuth2Client } from "google-auth-library";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import logger from '../utils/logger.js';

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

export const googleLogin = async (req, res) => {
    try {
        const { token } = req.body;

        const ticket = await client.verifyIdToken({
            idToken: token,
            audience: process.env.GOOGLE_CLIENT_ID,
        });

        const payload = ticket.getPayload();
        const { email, name, picture, sub: googleId } = payload;

        // FIXED: Use User.findOne() not findOne()
        let user = await User.findOne({ email });
        
        if (!user) {
            user = new User({
                fullname: name,
                email,
                password: googleId,
                googleProfilePicture: picture,
                googleId: googleId,
                authProvider: 'google'
            });
            await user.save();
        } else {
            // Update last login
            user.lastLogin = new Date();
            await user.save();
        }

        const appToken = jwt.sign(
            { id: user._id },
            process.env.JWT_SECRET,
            { expiresIn: "1d" }
        );

        const { password: _, ...userWithoutPassword } = user._doc;
        res.status(200).json({ 
            token: appToken, 
            user: userWithoutPassword 
        });

    } catch (error) {
        logger.error("Google login error:", error);
        res.status(500).json({ 
            message: "Google login failed", 
            error: error.message 
        });
    }
}