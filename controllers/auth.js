import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import crypto from "crypto";
import { sendEmail, emailTemplates } from "../utils/emailService.js";
import logger from '../utils/logger.js';

export const register = async (req, res) => {
    try {
        const { fullname, email, password } = req.body;

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: "Email already exists" });
        }
        if (!password) {
            return res.status(400).json({ message: "Password is required" });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = new User({
            fullname,
            email,
            password: hashedPassword
        });

        const savedUser = await newUser.save();
        try {
            const { saveMemory } = await import("../services/memoryService.js");
            // Add proper content
            await saveMemory(
                savedUser._id,
                `User Profile: ${fullname}, Email: ${email}, New user account created`,
                "user_profile"
            );
            logger.info("User profile saved to RAG memory");
        } catch (memError) {
            logger.error("User profile memory save failed:", memError);
        }

        // ADD EMAIL - NON-BLOCKING
        sendEmail(
            email,
            "Welcome to CareerGPT! 🎉",
            emailTemplates.welcome(fullname || email.split('@')[0])
        ).catch(error => logger.error('Welcome email failed:', error));

        res.status(201).json({ message: "User registered successfully", user: savedUser });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ message: "User does not exist." });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: "Invalid password" });
        }

        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "1d" });

        sendEmail(
            email,
            "Login Alert - CareerGPT",
            emailTemplates.loginAlert(user.fullname || user.email.split('@')[0])
        ).catch(error => logger.error('Login alert email failed:', error)); // CHANGED

        const { password: _, ...userWithoutPassword } = user._doc;

        try {
            const { saveMemory } = await import("../services/memoryService.js");
            const Memory = (await import("../models/Memory.js")).default;

            // DELETE OLD profile memory first
            await Memory.deleteMany({
                userId: user._id,
                type: "user_profile"
            });

            // THEN SAVE fresh profile (no duplicates)
            await saveMemory(
                user._id,
                `User Profile: ${user.fullname || user.email}, Email: ${user.email}, Last active: ${new Date().toISOString()}`,
                "user_profile"
            );
            logger.info("User profile updated in RAG memory");
        } catch (memError) {
            logger.error("User profile memory update failed:", memError);
        }

        res.status(200).json({ token, user: userWithoutPassword });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ message: "Email is required" });
        }

        // Find user - SAME PATTERN AS YOUR LOGIN
        const user = await User.findOne({ email });
        if (!user) {
            // Don't reveal if user exists for security
            return res.json({ message: "If an account exists, a reset email has been sent" });
        }

        // Generate reset token - SIMILAR TO YOUR JWT LOGIC
        const resetToken = crypto.randomBytes(32).toString("hex");
        const resetPasswordToken = crypto.createHash("sha256").update(resetToken).digest("hex");
        const resetPasswordExpiry = Date.now() + 15 * 60 * 1000; // 15 minutes

        // Save to database - SAME PATTERN AS YOUR REGISTER
        user.resetPasswordToken = resetPasswordToken;
        user.resetPasswordExpiry = resetPasswordExpiry;
        await user.save();

        // Create reset URL
        const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}&email=${email}`;

        // REPLACE EMAIL WITH TEMPLATE
        const emailResult = await sendEmail(
            email,
            "Reset Your Password - CareerGPT",
            emailTemplates.passwordReset(user.fullname || user.email.split('@')[0], resetUrl)
        );

        if (!emailResult.success) {
            logger.error('Password reset email failed:', emailResult.error); // CHANGED
            // Still return success to user even if email fails
        }

        res.json({ message: "Password reset link sent to your email" });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const resetPassword = async (req, res) => {
    try {
        const { token, newPassword, email } = req.body;

        if (!token || !newPassword) {
            return res.status(400).json({ message: "Token and new password are required" });
        }

        // Hash the token - SAME PATTERN AS FORGOT PASSWORD
        const resetPasswordToken = crypto.createHash("sha256").update(token).digest("hex");

        // Find user - SAME PATTERN AS YOUR LOGIN
        const user = await User.findOne({
            email,
            resetPasswordToken,
            resetPasswordExpiry: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(400).json({ message: "Invalid or expired reset token" });
        }

        // Hash new password - SAME PATTERN AS YOUR REGISTER
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        // Update user - SAME PATTERN AS YOUR REGISTER
        user.password = hashedPassword;
        user.resetPasswordToken = undefined;
        user.resetPasswordExpiry = undefined;
        await user.save();

        // ADD SUCCESS EMAIL - NON-BLOCKING
        sendEmail(
            email,
            "Password Changed Successfully - CareerGPT",
            emailTemplates.passwordResetSuccess(user.fullname || user.email.split('@')[0])
        ).catch(error => logger.error('Password reset success email failed:', error)); // CHANGED

        res.status(200).json({ message: "Password reset successful" });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};