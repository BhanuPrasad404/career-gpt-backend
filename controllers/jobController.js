// controllers/jobController.js
import JobApplication from '../models/JobApplication.js';
import Resume from '../models/Resume.js';
import { GeminiService } from './resumeController.js';
import logger from '../utils/logger.js';
import NotificationService from '../services/notificationService.js';

// Import Upstash Redis
import { Redis } from "@upstash/redis";

// Initialize Redis with your .env credentials
const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const geminiService = new GeminiService();
// CREATE JOB APPLICATION + ANALYZE MATCH
const createJobApplication = async (req, res) => {
    try {
        const { company, role, jobDescription } = req.body;

        // Enhanced input validation
        if (!company?.trim()) {
            return res.status(400).json({
                success: false,
                message: 'Company name is required',
                code: 'VALIDATION_ERROR'
            });
        }
        if (!role?.trim()) {
            return res.status(400).json({
                success: false,
                message: 'Job role is required',
                code: 'VALIDATION_ERROR'
            });
        }
        if (!jobDescription?.trim() || jobDescription.trim().length < 50) {
            return res.status(400).json({
                success: false,
                message: 'Job description must be at least 50 characters',
                code: 'VALIDATION_ERROR'
            });
        }
        if (jobDescription.length > 20000) {
            return res.status(400).json({
                success: false,
                message: 'Job description is too long (max 20,000 characters)',
                code: 'VALIDATION_ERROR'
            });
        }
        // Get user's active resume
        const activeResume = await Resume.findOne({
            userId: req.user.id,
            isActive: true
        });

        if (!activeResume) {
            return res.status(404).json({
                success: false,
                message: 'No active resume found. Please upload a resume first.',
                code: 'NO_RESUME'
            });
        }
        // ANALYZE JOB MATCH WITH GEMINI
        const startTime = Date.now();
        const matchAnalysis = await analyzeJobMatch(
            activeResume.parsedText,
            jobDescription,
            role,
            company
        );
        const analysisTime = Date.now() - startTime;

        logger.info(`Job analysis completed in ${analysisTime}ms for user ${req.user.id}, score: ${matchAnalysis.matchScore}, cached: ${matchAnalysis._cached || false}`);

        // CREATE JOB APPLICATION
        const jobApplication = await JobApplication.create({
            userId: req.user.id,
            resumeId: activeResume._id,
            job: {
                company: company.trim(),
                role: role.trim(),
                jobDescription: jobDescription.substring(0, 15000)
            },
            matchAnalysis: {
                ...matchAnalysis,
                analyzedAt: new Date()
            }
        });
        await NotificationService.sendJobMatchNotification(
            req.user.id,
            jobApplication._id,
            matchAnalysis.matchScore
        );
        // Save to memory (RAG)
        try {
            const Memory = (await import("../models/Memory.js")).default;
            const { saveMemory } = await import("../services/memoryService.js");

            const existingJobMemories = await Memory.countDocuments({
                userId: req.user.id,
                type: "job_application"
            });

            if (existingJobMemories >= 5) {
                await Memory.deleteOne({
                    userId: req.user.id,
                    type: "job_application"
                }, { sort: { createdAt: 1 } });
            }

            await saveMemory(
                req.user.id,
                `Applied to ${company} as ${role}. Match Score: ${matchAnalysis.matchScore}%. Missing: ${matchAnalysis.missingSkills?.slice(0, 3).join(", ")}`,
                "job_application"
            );

            logger.info("Job application RAG memory updated successfully!");
        } catch (memError) {
            logger.error("Job memory saving failed:", memError);
        }

        res.status(201).json({
            success: true,
            message: 'Job application created and analyzed successfully',
            data: jobApplication,
            metadata: {
                analysisTime: `${analysisTime}ms`,
                cached: matchAnalysis._cached || false
            }
        });

    } catch (error) {
        logger.error('Create job application error:', {
            error: error.message,
            userId: req.user?.id,
            stack: error.stack
        });

        res.status(500).json({
            success: false,
            message: 'Error creating job application',
            error: error.message,
            code: 'SERVER_ERROR'
        });
    }
};

const analyzeJobMatch = async (resumeText, jobDescription, role, company) => {
    try {
        // Create cache key
        const cacheKey = `match:${Buffer.from(
            resumeText.substring(0, 500) + jobDescription.substring(0, 500)
        ).toString('base64')}`;

        // 1️ CHECK REDIS CACHE FIRST
        try {
            const cached = await redis.get(cacheKey);
            if (cached) {
                logger.info(` Cache HIT for key: ${cacheKey.substring(0, 50)}...`);
                return { ...cached, _cached: true };
            }
        } catch (redisError) {
            logger.warn('Redis cache check failed, proceeding:', redisError.message);
        }
        const prompt = `
ROLE: You are an expert ATS (Applicant Tracking System) algorithm with 15 years of recruitment experience. You analyze resumes against job descriptions with professional HR precision.

TASK: Compare the RESUME with JOB DESCRIPTION and provide a detailed match analysis.

CONTEXT:
- Job Role: ${role}
- Company: ${company}
- Analysis Purpose: Career coaching and interview preparation

RESUME TEXT (first 10,000 characters):
${resumeText.substring(0, 10000)}

JOB DESCRIPTION (first 10,000 characters):
${jobDescription.substring(0, 10000)}

ANALYSIS CRITERIA (WEIGHTED):
1. **Technical Skills Match (40%)** - Programming languages, frameworks, tools, certifications
2. **Experience Relevance (30%)** - Years of experience, seniority level, domain expertise
3. **Soft Skills & Culture Fit (15%)** - Communication, leadership, teamwork, company values
4. **Education & Qualifications (10%)** - Degrees, certifications, training
5. **Industry Alignment (5%)** - Sector-specific knowledge, market trends

STRICT OUTPUT FORMAT - RETURN VALID JSON ONLY:
{
  "matchScore": number (0-100, based on weighted criteria above),
  "matchingSkills": ["specific_skill_1", "specific_skill_2", ...],
  "missingSkills": ["required_skill_1", "required_skill_2", ...],
  "weaknesses": ["concise_weakness_1", "concise_weakness_2", ...],
  "strengths": ["concise_strength_1", "concise_strength_2", ...],
  "suggestions": ["actionable_suggestion_1", "actionable_suggestion_2", ...],
   "scoreBreakdown": [
    {
      "category": "Technical Skills",
      "score": 80,
      "weight": 40,
      "details": ["React expertise", "Node.js proficiency"]
    },
    {
      "category": "Experience Relevance", 
      "score": 70,
      "weight": 30,
      "details": ["5 years experience", "Senior level fit"]
    },
    {
      "category": "Soft Skills & Culture Fit",
      "score": 75,
      "weight": 15,
      "details": ["Good communication", "Team player"]
    },
    {
      "category": "Education & Qualifications",
      "score": 85,
      "weight": 10,
      "details": ["Bachelor's degree", "Relevant certifications"]
    },
    {
      "category": "Industry Alignment",
      "score": 60,
      "weight": 5,
      "details": ["Tech industry experience"]
    }
  ]
}
  "confidence": number (0-100, how confident you are in this analysis)
}

CRITICAL RULES:
1. **Be realistic, not optimistic** - Actual ATS systems are strict
2. **Skills must be specific** - Not "good communication" but "technical documentation"
3. **Missing skills must be explicitly mentioned in JD**
4. **Suggestions must be actionable** - "Add AWS certification" not "learn cloud"
5. **MatchScore must reflect weighted criteria breakdown**
6. **NO markdown, NO explanations, ONLY the JSON object**

EXAMPLE OF GOOD RESPONSE:
{
  "matchScore": 72,
  "matchingSkills": ["React.js", "Redux", "TypeScript", "REST APIs"],
  "missingSkills": ["AWS Lambda", "Serverless Architecture", "Jest testing"],
  "weaknesses": ["Limited cloud experience", "No CI/CD pipeline knowledge"],
  "strengths": ["Strong frontend fundamentals", "Modern framework expertise"],
  "suggestions": ["Complete AWS Cloud Practitioner certification", "Add unit testing examples to portfolio"],
  "confidence": 85
}

NOW ANALYZE THE PROVIDED RESUME AND JOB DESCRIPTION:
`;
        const result = await geminiService.callGeminiAPI(prompt);
        const responseText = result.candidates[0].content.parts[0].text;
        const cleanJson = responseText.replace(/```json|```/g, '').trim();

        // Validate AI response
        let parsed;
        try {
            parsed = JSON.parse(cleanJson);
        } catch (parseError) {
            logger.error('Failed to parse AI response:', parseError);
            throw new Error('AI service returned invalid response');
        }

        // Validate and sanitize
        if (typeof parsed.matchScore !== 'number') {
            parsed.matchScore = 50;
        }
        parsed.matchScore = Math.max(0, Math.min(100, parsed.matchScore));

        if (!Array.isArray(parsed.matchingSkills)) parsed.matchingSkills = [];
        if (!Array.isArray(parsed.missingSkills)) parsed.missingSkills = [];
        if (!Array.isArray(parsed.weaknesses)) parsed.weaknesses = [];
        if (!Array.isArray(parsed.strengths)) parsed.strengths = [];
        if (!Array.isArray(parsed.suggestions)) parsed.suggestions = [];

        //  STORE IN REDIS CACHE (1 hour expiry)
        try {
            await redis.setex(cacheKey, 3600, parsed); // 3600 seconds = 1 hour
            logger.info(`Stored in Redis cache: ${cacheKey.substring(0, 50)}...`);
        } catch (setError) {
            logger.warn('Failed to store in Redis cache:', setError.message);
        }

        return parsed;

    } catch (error) {
        logger.error('Job match analysis error:', error);

        // Fallback analysis
        const resumeLower = resumeText.toLowerCase();
        const jobLower = jobDescription.toLowerCase();

        const techKeywords = ['javascript', 'react', 'node', 'python', 'aws', 'docker', 'api', 'mongodb', 'express'];
        const matched = techKeywords.filter(keyword =>
            resumeLower.includes(keyword) && jobLower.includes(keyword)
        );
        const missing = techKeywords.filter(keyword =>
            !resumeLower.includes(keyword) && jobLower.includes(keyword)
        );

        return {
            matchScore: Math.min(90, matched.length * 15),
            matchingSkills: matched,
            missingSkills: missing,
            weaknesses: ['AI service temporarily unavailable'],
            strengths: ['Basic keyword matching active'],
            suggestions: ['Try again in a few moments for full analysis']
        };
    }
};

const updateApplicationStatus = async (req, res) => {
    try {
        const { applicationId } = req.params;
        const { status, interviewDate } = req.body;

        const validStatuses = ['applied', 'interview', 'offer', 'rejected', 'accepted'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid status'
            });
        }

        const updateData = { status };

        // If status is interview, set interview date
        if (status === 'interview' && interviewDate) {
            updateData.interviewDate = new Date(interviewDate);
        }

        // If status is offer/rejected/accepted, set decision date
        if (['offer', 'rejected', 'accepted'].includes(status)) {
            updateData.decisionDate = new Date();
        }

        const application = await JobApplication.findOneAndUpdate(
            { _id: applicationId, userId: req.user.id },
            updateData,
            { new: true }
        );

        if (!application) {
            return res.status(404).json({
                success: false,
                message: 'Job application not found'
            });
        }

        res.json({
            success: true,
            message: `Application status updated to ${status}`,
            data: application
        });

    } catch (error) {
        logger.error('Update application status error:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating application status',
            error: error.message
        });
    }
};

// TRACK AI PREP USAGE
const trackAIPrep = async (req, res) => {
    try {
        const { applicationId } = req.params;

        // 1. Mark AI prep usage
        const application = await JobApplication.findOneAndUpdate(
            { _id: applicationId, userId: req.user.id },
            {
                aiPrepUsed: true,
                lastPrepAt: new Date()
            },
            { new: true }
        ).populate("resumeId");

        if (!application) {
            return res.status(404).json({
                success: false,
                message: 'Job application not found'
            });
        }

        // 2Save the PREP context to RAG (new logic)
        try {
            const Memory = (await import("../models/Memory.js")).default;
            const { saveMemory } = await import("../services/memoryService.js");

            // Delete previous active prep memory
            await Memory.deleteMany({
                userId: req.user.id,
                type: "current_interview_prep"
            });

            // Build RAG content
            const prepContext = `
Active Interview Prep Context
Company: ${application.job.company}
Role: ${application.job.role}
Job Description: ${application.job.jobDescription}
Interview Date: ${application.interviewDate || "Not scheduled yet"}
Matched Skills: ${application.matchAnalysis?.matchingSkills?.join(", ")}

Resume Used (Version ${application.resumeId?.version}):
${application.resumeId?.parsedText?.substring(0, 6000)}
            `;

            // Save memory
            await saveMemory(
                req.user.id,
                prepContext,
                "current_interview_prep"
            );

            logger.info("Updated active interview prep RAG memory.");
        } catch (ragError) {
            logger.error("Failed to save interview prep to RAG:", ragError);
        }

        // 3. Response
        res.json({
            success: true,
            message: 'AI prep usage tracked & RAG updated',
            data: application
        });

    } catch (error) {
        logger.error('Track AI prep error:', error);
        res.status(500).json({
            success: false,
            message: 'Error tracking AI prep',
            error: error.message
        });
    }
};


// GET USER'S JOB APPLICATIONS
const getUserApplications = async (req, res) => {
    try {
        const { status } = req.query;

        const filter = { userId: req.user.id };
        if (status) filter.status = status;

        const applications = await JobApplication.find(filter)
            .populate('resumeId', 'version uploadedAt')
            .sort({ createdAt: -1 });

        res.json({
            success: true,
            data: applications
        });

    } catch (error) {
        logger.error('Get applications error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching job applications',
            error: error.message
        });
    }
};

// DELETE JOB APPLICATION
const deleteJobApplication = async (req, res) => {
    try {
        const { applicationId } = req.params;
        const userId = req.user.id;

        // Validate application ID
        if (!applicationId || !applicationId.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid application ID format',
                code: 'INVALID_ID'
            });
        }

        logger.info(`Attempting to delete job application ${applicationId} for user ${userId}`);

        // Find and delete the application
        const deletedApplication = await JobApplication.findOneAndDelete({
            _id: applicationId,
            userId: userId
        });

        // Check if application was found and deleted
        if (!deletedApplication) {
            logger.warn(`Job application ${applicationId} not found for user ${userId}`);
            return res.status(404).json({
                success: false,
                message: 'Job application not found or you do not have permission to delete it',
                code: 'NOT_FOUND'
            });
        }

        logger.info(`Successfully deleted job application ${applicationId} for user ${userId}`);

        // Clean up related memory (optional but good practice)
        try {
            const Memory = (await import("../models/Memory.js")).default;

            // Remove any RAG memory related to this job application
            await Memory.deleteMany({
                userId: userId,
                $or: [
                    { content: { $regex: deletedApplication.job.company, $options: 'i' } },
                    { content: { $regex: deletedApplication.job.role, $options: 'i' } },
                    {
                        type: "job_application",
                        content: { $regex: applicationId, $options: 'i' }
                    }
                ]
            });

            logger.info(`Cleaned up RAG memory for deleted application ${applicationId}`);
        } catch (memoryError) {
            logger.warn('Failed to clean up RAG memory:', memoryError.message);
            // Don't fail the whole request if memory cleanup fails
        }

        res.json({
            success: true,
            message: 'Job application deleted successfully',
            data: {
                id: applicationId,
                company: deletedApplication.job.company,
                role: deletedApplication.job.role,
                deletedAt: new Date()
            }
        });

    } catch (error) {
        logger.error('Delete job application error:', {
            error: error.message,
            userId: req.user?.id,
            applicationId: req.params?.applicationId,
            stack: error.stack
        });

        res.status(500).json({
            success: false,
            message: 'Error deleting job application',
            error: error.message,
            code: 'SERVER_ERROR'
        });
    }
};

export {
    createJobApplication,
    updateApplicationStatus,
    trackAIPrep,
    getUserApplications,
    deleteJobApplication
};