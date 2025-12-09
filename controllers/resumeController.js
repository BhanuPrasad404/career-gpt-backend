// controllers/resumeController.js
import { v2 as cloudinary } from 'cloudinary';
//import pdfParse from 'pdf-parse';
import Resume from '../models/Resume.js';
import ImprovementGoal from '../models/ImprovementGoal.js';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import logger from '../utils/logger.js';

// Use YOUR Gemini class that already works
class GeminiService {
    constructor() {
        // Change to GROQ
        this.GROQ_API_KEY = process.env.GROQ_API_KEY;
        this.GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
    }

    async callGeminiAPI(prompt) {
        // Actually call Groq
        const response = await fetch(this.GROQ_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.GROQ_API_KEY}`
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile', // Use Groq model
                messages: [{
                    role: 'user',
                    content: prompt
                }],
                temperature: 0.7,
                max_tokens: 8000
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Groq API Error: ${response.status} ${response.statusText} - ${errorText}`);
        }

        return await response.json();
    }
}

const geminiService = new GeminiService();

// UPLOAD RESUME TO CLOUDINARY
const uploadResume = async (req, res) => {
    try {
        logger.info(' Resume upload started...'); // CHANGED

        // Validate file exists - USING YOUR PATTERN
        if (!req.file) {
            logger.warn('Resume upload failed - no file provided', { userId: req.user?.id }); // CHANGED
            return res.status(400).json({
                success: false,
                message: 'No resume file selected'
            });
        }

        const userId = req.user.id;
        const file = req.file;

        logger.info('Processing resume upload', { // CHANGED
            userId,
            fileName: file.originalname,
            fileSize: file.size,
            mimeType: file.mimetype
        });

        // Validate file type
        const allowedTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
        if (!allowedTypes.includes(file.mimetype)) {
            return res.status(400).json({
                success: false,
                message: 'Only PDF and Word documents are allowed'
            });
        }

        // Validate file size (5MB max)
        if (file.size > 5 * 1024 * 1024) {
            logger.warn('Resume upload failed - file too large', { // CHANGED
                userId,
                fileSize: file.size,
                maxSize: 5 * 1024 * 1024
            });
            return res.status(400).json({
                success: false,
                message: 'File size must be less than 5MB'
            });
        }

        logger.info(' Uploading to Cloudinary', { // CHANGED
            userId,
            folder: 'career-gpt/resumes'
        });

        const dataUri = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;

        const uploadResult = await cloudinary.uploader.upload(dataUri, {
            folder: `career-gpt/resumes/${userId}`,
            public_id: `resume_${Date.now()}_${file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_')}`,
            access_mode: 'public',
            resource_type: 'auto',
            overwrite: false,
        });

        logger.info(' Cloudinary upload successful', { // CHANGED
            userId,
            fileId: uploadResult.public_id,
            fileName: file.originalname,
            cloudinaryUrl: uploadResult.secure_url
        });


        logger.info(' Parsing PDF...'); // CHANGED

        // Import proper Node version of PDF.js

        pdfjs.GlobalWorkerOptions.workerSrc = 'pdfjs-dist/legacy/build/pdf.worker.mjs';

        const pdfData = new Uint8Array(file.buffer);

        // Load PDF
        const loadingTask = pdfjs.getDocument({ data: pdfData });
        const pdf = await loadingTask.promise;

        let extractedText = '';

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();

            extractedText += textContent.items.map(item => item.str).join(' ') + '\n';
        }
        logger.info(' PDF parsed successfully'); // CHANGED
        logger.info('Parsed text length:', extractedText.length); // CHANGED
        logger.info(' PDF parsed, text length:', extractedText.length); // CHANGED

        // Generate text hash
        const crypto = await import('crypto');
        const textHash = crypto.createHash('md5').update(extractedText).digest('hex');

        // AI Analysis
        logger.info(' Analyzing with Gemini...'); // CHANGED
        const analysis = await analyzeResumeWithGemini(extractedText);
        analysis.analyzedAt = new Date();
        logger.info(' AI analysis complete'); // CHANGED

        // Save to MongoDB
        logger.info('Saving to database...'); // CHANGED
        const newResume = await Resume.create({
            userId: userId,
            originalFileName: file.originalname,
            cloudinaryUrl: uploadResult.secure_url,
            cloudinaryPublicId: uploadResult.public_id,
            fileSize: file.size,
            parsedText: extractedText,
            textHash: textHash,
            aiAnalysis: analysis,
            analyzedAt: new Date()
        });
        logger.info(' Database save complete'); // CHANGED

        // Create improvement goals
        await createImprovementGoals(userId, newResume._id, analysis.criticalIssues);
        try {
            const Memory = (await import("../models/Memory.js")).default;
            const { saveMemory } = await import("../services/memoryService.js");


            await Memory.deleteMany({
                userId,
                type: {
                    $in: [
                        "resume_skills",
                        "resume_soft_skills",
                        "resume_tools",
                        "resume_certifications",
                        "resume_languages",
                        "resume_strengths",
                        "resume_issues",
                        "resume_roles",
                        "resume_scores",
                        "resume_experience_level",
                        "resume_summary"
                    ]
                }
            });

            // TECHNICAL SKILLS
            await saveMemory(
                userId,
                `Technical Skills: ${analysis.extractedSkills.technical.join(", ") || "None"}`,
                "resume_skills"
            );
            //  SOFT SKILLS
            await saveMemory(
                userId,
                `Soft Skills: ${analysis.extractedSkills.soft.join(", ") || "None"}`,
                "resume_soft_skills"
            );

            // TOOLS & TECHNOLOGIES
            await saveMemory(
                userId,
                `Tools & Technologies: ${analysis.extractedSkills.tools.join(", ") || "None"}`,
                "resume_tools"
            );

            //  CERTIFICATIONS
            await saveMemory(
                userId,
                `Certifications: ${analysis.extractedSkills.certifications.join(", ") || "None"}`,
                "resume_certifications"
            );

            // LANGUAGES
            await saveMemory(
                userId,
                `Languages: ${analysis.extractedSkills.languages.join(", ") || "None"}`,
                "resume_languages"
            );

            //  QUANTIFIED STRENGTHS
            const strengthSummary = analysis.strengths.map(s =>
                `${s.skill} → Impact: ${s.impact} (Evidence: ${s.evidence})`
            ).join(" | ");

            await saveMemory(
                userId,
                `Resume Strengths: ${strengthSummary || "None"}`,
                "resume_strengths"
            );

            //  CRITICAL ISSUES With Priorities
            const issueSummary = analysis.criticalIssues.map(i =>
                `${i.issue} → Priority: ${i.priority} (Section: ${i.section})`
            ).join(" | ");

            await saveMemory(
                userId,
                `Resume Issues: ${issueSummary || "None"}`,
                "resume_issues"
            );

            //  SUGGESTED ROLES
            await saveMemory(
                userId,
                `Suggested Job Roles: ${analysis.suggestedRoles.join(", ") || "None"}`,
                "resume_roles"
            );

            //  EXPERIENCE LEVEL
            await saveMemory(
                userId,
                `Experience Level: ${analysis.experienceLevel}`,
                "resume_experience_level"
            );

            // 1 SCORES
            await saveMemory(
                userId,
                `Resume Scores → Overall: ${analysis.overallScore}, ATS: ${analysis.atsScore}`,
                "resume_scores"
            );

            // AI-GENERATED SUMMARY (NEW)
            const summaryText = `
           Experience Level: ${analysis.experienceLevel}
           Strengths: ${strengthSummary}
           Issues: ${issueSummary}
           Best Roles: ${analysis.suggestedRoles.join(", ")}
    `.trim();

            await saveMemory(
                userId,
                `Resume Summary: ${summaryText}`,
                "resume_summary"
            );

            logger.info("Resume RAG memory updated successfully!");
        } catch (memError) {
            logger.error("Resume memory saving failed:", memError);
        }


        res.status(201).json({
            success: true,
            message: 'Resume analyzed successfully',
            data: {
                resumeId: newResume._id,
                analysis: newResume.aiAnalysis
            }
        });

    } catch (error) {
        logger.error(' Resume upload failed', error, {
            userId: req.user?.id,
            fileName: req.file?.originalname
        });
        res.status(500).json({
            success: false,
            message: 'Error processing resume: ' + error.message
        });
    }
};
const analyzeResumeWithGemini = async (resumeText) => {
    try {
        const prompt = `
EXPERT RESUME ANALYSIS - ENHANCED STRUCTURE

You are Chief Resume Analyst at a Fortune 500 tech company. Analyze this resume with extreme precision.

RESUME TEXT:
${resumeText.substring(0, 20000)}

**CRITICAL ANALYSIS REQUIREMENTS:**

1. **STRENGTHS ANALYSIS:**
   - MUST include QUANTIFIABLE IMPACT for each strength
   - Evidence must be SPECIFIC and verifiable from resume text
   - Relevance based on current tech market demand

2. **CRITICAL ISSUES:**
   - MUST specify exact SECTION where issue occurs
   - Suggestions must be ACTIONABLE and concrete
   - Priority based on hiring impact

3. **SKILLS EXTRACTION:**
   - Technical: Programming languages, frameworks, databases
   - Soft: Leadership, communication, collaboration  
   - Tools: Development tools, platforms, software
   - Certifications: Professional certifications mentioned
   - Languages: Both programming AND human languages

4. **SCORING:**
   - Overall Score: Formatting, content, achievements, professionalism
   - ATS Score: Keyword optimization, structure, parsing compatibility
   - Experience Level: Be accurate based on years and responsibility

**RETURN EXACT JSON STRUCTURE - NO DEVIATIONS:**

{
  "overallScore": number (0-100, be critical),
  "atsScore": number (0-100, ATS optimization), 
  "experienceLevel": "Junior/Mid-level/Senior",
  "strengths": [
    {
      "skill": "string (specific skill name)",
      "evidence": "string (exact phrase from resume)",
      "relevance": "high/medium/low",
      "impact": "string (quantifiable result - REQUIRED)"
    }
  ],
  "criticalIssues": [
    {
      "issueId": "unique_id_1", 
      "issue": "string (specific problem)",
      "suggestion": "string (actionable improvement)",
      "priority": "high/medium/low",
      "section": "string (resume section affected)"
    }
  ],
  "extractedSkills": {
    "technical": ["array of specific technical skills"],
    "soft": ["array of demonstrated soft skills"],
    "tools": ["array of tools and platforms"],
    "certifications": ["array of certifications"],
    "languages": ["array of languages"]
  },
  "suggestedRoles": ["realistic job roles based on experience"]
}

**BE BRUTALLY HONEST AND SPECIFIC:**
- If no quantifiable impact found, strength relevance should be "low"
- If section cannot be determined, use "General" but try to be specific
- Extract ONLY skills explicitly mentioned in resume
- Roles must match actual experience level

Focus on actionable insights that would actually help this candidate get hired.
`;

        const result = await geminiService.callGeminiAPI(prompt);

        // Extract text from response
        //const responseText = result.choices[0].message.content;

        const responseText = result?.choices?.[0]?.message?.content;

        // Clean the response
        const cleanJson = responseText.replace(/```json|```/g, '').trim();

        const analysis = JSON.parse(cleanJson);

        // Validate structure matches our enhanced schema
        const requiredFields = ['overallScore', 'atsScore', 'experienceLevel', 'strengths', 'criticalIssues', 'extractedSkills', 'suggestedRoles'];
        const hasAllFields = requiredFields.every(field => analysis[field] !== undefined);

        if (!hasAllFields) {
            throw new Error('AI returned incomplete analysis structure');
        }

        // Ensure new fields exist (backward compatibility)
        analysis.strengths = analysis.strengths.map(strength => ({
            ...strength,
            impact: strength.impact || "No quantifiable impact specified"
        }));

        analysis.criticalIssues = analysis.criticalIssues.map(issue => ({
            ...issue,
            section: issue.section || "General"
        }));

        analysis.extractedSkills = {
            technical: analysis.extractedSkills.technical || [],
            soft: analysis.extractedSkills.soft || [],
            tools: analysis.extractedSkills.tools || [],
            certifications: analysis.extractedSkills.certifications || [],
            languages: analysis.extractedSkills.languages || []
        };

        return analysis;

    } catch (error) {
        logger.error('Gemini analysis error:', error); // CHANGED
        // Enhanced fallback with new structure
        return {
            overallScore: 50,
            atsScore: 60,
            experienceLevel: "Mid-level",
            strengths: [{
                skill: "Basic resume structure",
                evidence: "Standard sections present",
                relevance: "medium",
                impact: "Meets minimum requirements"
            }],
            criticalIssues: [{
                issueId: "issue_fallback",
                issue: "AI analysis temporarily unavailable",
                suggestion: "Please try uploading again",
                priority: "medium",
                section: "System"
            }],
            extractedSkills: {
                technical: ["General IT skills"],
                soft: ["Communication", "Teamwork"],
                tools: ["Microsoft Office"],
                certifications: [],
                languages: []
            },
            suggestedRoles: ["Software Developer"]
        };
    }
};

//  CREATE IMPROVEMENT GOALS FUNCTION
const createImprovementGoals = async (userId, resumeId, criticalIssues) => {
    try {
        const goals = criticalIssues.map(issue => ({
            userId: userId,
            resumeId: resumeId,
            issueId: issue.issueId,
            description: issue.issue,
            suggestion: issue.suggestion,
            priority: issue.priority
        }));

        await ImprovementGoal.insertMany(goals);
    } catch (error) {
        logger.error('Error creating improvement goals:', error); // CHANGED
    }
};

// GET RESUME ANALYSIS
const getResumeAnalysis = async (req, res) => {
    try {
        const resume = await Resume.findOne({
            userId: req.user.id,
            isActive: true
        });

        if (!resume) {
            return res.status(404).json({
                success: false,
                message: 'No resume found'
            });
        }

        res.json({
            success: true,
            data: resume
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching resume analysis',
            error: error.message
        });
    }
};



// GET ALL USER RESUMES
const getUserResumes = async (req, res) => {
    try {
        logger.info(' Fetching all resumes for user:', req.user.id); // CHANGED

        const resumes = await Resume.find({
            userId: req.user.id
        })
            .select('_id originalFileName cloudinaryUrl fileSize parsedText aiAnalysis analyzedAt isActive textHash version description')
            .sort({ analyzedAt: -1 }) // Newest first
            .lean();

        logger.info(` Found ${resumes.length} resumes for user`); // CHANGED

        // Get improvement goals count for each resume
        const resumesWithGoals = await Promise.all(
            resumes.map(async (resume) => {
                const goals = await ImprovementGoal.find({
                    resumeId: resume._id
                });

                const completedGoals = goals.filter(goal => goal.checked).length;
                const totalGoals = goals.length;

                return {
                    ...resume,
                    improvementGoals: goals,
                    goalsStats: {
                        total: totalGoals,
                        completed: completedGoals,
                        progress: totalGoals > 0 ? Math.round((completedGoals / totalGoals) * 100) : 0
                    }
                };
            })
        );

        res.json({
            success: true,
            message: `Found ${resumes.length} resumes`,
            data: resumesWithGoals
        });

    } catch (error) {
        logger.error('Get user resumes error:', error); // CHANGED
        res.status(500).json({
            success: false,
            message: 'Error fetching resumes',
            error: error.message
        });
    }
};

const getResumeById = async (req, res) => {
    try {
        const { resumeId } = req.params;
        logger.info(' Fetching specific resume:', resumeId); // CHANGED

        const resume = await Resume.findOne({
            _id: resumeId,
            userId: req.user.id
        })

        if (!resume) {
            return res.status(404).json({
                success: false,
                message: 'Resume not found'
            });
        }

        res.json({
            success: true,
            message: 'Resume fetched successfully',
            data: resume
        });

    } catch (error) {
        logger.error(' Get resume by ID error:', error); // CHANGED
        res.status(500).json({
            success: false,
            message: 'Error fetching resume',
            error: error.message
        });
    }
};

const deleteResume = async (req, res) => {
    try {
        const { resumeId } = req.params;
        const userId = req.user.id;

        logger.info('Deleting resume:', { resumeId, userId }); // CHANGED

        // Find the resume and verify ownership
        const resume = await Resume.findOne({
            _id: resumeId,
            userId: userId
        });

        if (!resume) {
            return res.status(404).json({
                success: false,
                message: 'Resume not found or you do not have permission to delete it'
            });
        }
        // Delete from Cloudinary if public ID exists
        if (resume.cloudinaryPublicId) {
            try {
                await cloudinary.uploader.destroy(resume.cloudinaryPublicId);
                logger.info('Deleted from Cloudinary:', resume.cloudinaryPublicId); // CHANGED
            } catch (cloudinaryError) {
                logger.error('Cloudinary deletion error:', cloudinaryError); // CHANGED
                // Continue with database deletion even if Cloudinary fails
            }
        }

        // Delete improvement goals associated with this resume
        await ImprovementGoal.deleteMany({ resumeId: resumeId });

        // Delete the resume from database
        await Resume.findByIdAndDelete(resumeId);

        logger.info('Resume deleted successfully:', resumeId); // CHANGED

        res.status(200).json({
            success: true,
            message: 'Resume deleted successfully',
            data: { deletedResumeId: resumeId }
        });

    } catch (error) {
        logger.error('Error deleting resume:', error); // CHANGED

        if (error.name === 'CastError') {
            return res.status(400).json({
                success: false,
                message: 'Invalid resume ID format'
            });
        }

        res.status(500).json({
            success: false,
            message: 'Server error while deleting resume',
            error: process.env.NODE_ENV === 'production' ? {} : error.message
        });
    }
};
export {
    uploadResume,
    getResumeAnalysis,
    GeminiService,
    getUserResumes,
    getResumeById,
    deleteResume
};