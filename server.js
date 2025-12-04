// server.js
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import dotenv from "dotenv"
import multer from "multer";
import helmet from "helmet";
import morgan from "morgan";
import path from "path"
import authRou from "./routes/auth.js"
import chatRoutes from "./routes/chatRoutes.js"
//import { jobsRoute } from "./routes/jobsRoute.js";
import roadMapRoutes from './routes/roadMapSave.js'
import authCheck from "./controllers/AuthCheck.js"
import googleAuth from "./routes/GoogleAuthRoutes.js"
import profileRoutes from "./routes/profileRoute.js"
//import fileUpload from 'express-fileupload';
import careerRoadmapRoutes from './routes/careerRoadmapRoutes.js';
import progressRoutes from "./routes/progressRoutes.js";
import resumeRoutes from './routes/resumeRoutes.js';
import jobRoutes from './routes/jobRoutes.js';
import improvementRoutes from './routes/improvementRoutes.js';
import logger from './utils/logger.js';
import notificationRoutes from './routes/notificationRoutes.js';
import { initializeSocket } from './server/socket.js';
import { createServer } from "http";


const app = express();
app.set('trust proxy', 1);
const server = createServer(app);

const io = initializeSocket(server);

dotenv.config();

logger.info('=== DEBUG IN SERVER.JS ===');
logger.info('API Key from env:', process.env.GEMINI_API_KEY ? 'LOADED' : 'MISSING');
logger.info('Key length:', process.env.GEMINI_API_KEY?.length);
logger.info('Key first chars:', process.env.GEMINI_API_KEY?.substring(0, 10));
logger.info('All env vars:', Object.keys(process.env).filter(key => key.includes('GEMINI') || key.includes('MONGO')));

const PORT = process.env.PORT || 5001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(helmet())
app.use(helmet.crossOriginResourcePolicy({ policy: 'cross-origin' }));
app.use(morgan("common"));

// Add this route to check ALL memories for current user

app.get("/", (req, res) => {
  res.json({
    message: "Career-GPT Backend is running",
    socket: io ? "Socket.io initialized" : "Socket.io not initialized"
  });
});

app.get('/test-memories', async (req, res) => {
  try {
    // Use YOUR user ID from the logs: "68cab2d287b3af541ff0bc76"
    const Memory = await import("./models/Memory.js");
    const memories = await Memory.default.find({
      userId: "68cab2d287b3af541ff0bc76"
    });

    res.json({
      success: true,
      memoriesFound: memories.length,
      memories: memories.map(m => ({
        type: m.type,
        content: m.content,
        createdAt: m.createdAt
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.use("/api/chats", chatRoutes);
app.use("/api/roadmaps", roadMapRoutes);
app.use("/api/auth/verify", authCheck)
app.use("/api/auth", authRou)
app.use("/api/auth/googleauth", googleAuth);
app.use("/api/profile", profileRoutes)
app.use('/api/career-roadmaps', careerRoadmapRoutes);
app.use("/api/progress", progressRoutes);
app.use('/api/resume', resumeRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/improvements', improvementRoutes);
app.use('/api/notifications', notificationRoutes);
//app.use('/api/memory-graph', memoryGraphRoutes);
// Start server
mongoose
  .connect(process.env.MONGO_URL, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Server started on port ${PORT}`);
      console.log(`✅ Socket.io initialized`);
      console.log(`✅ WebSocket URL: ws://localhost:${PORT}`);
    });
  })
  .catch((err) => console.error("MongoDB connection failed:", err));
