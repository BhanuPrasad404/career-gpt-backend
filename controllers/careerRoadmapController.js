// controllers/careerRoadmapController.js
import GeminiService from '../services/geminiService.js';
import RoadMap from '../models/RoadMap.js';
import { saveMemory } from "../services/memoryService.js";
import logger from '../utils/logger.js';

// Helper functions
const validateUserData = (userData) => {
    logger.info(' Validating user data:', userData); // CHANGED

    if (!userData) {
        return 'User data is required';
    }

    const required = ['name', 'currentRole', 'currentSkills', 'targetRole', 'experience', 'goals', 'timeCommitment'];
    const missing = required.filter(field => !userData[field]);

    if (missing.length > 0) {
        return `Missing required fields: ${missing.join(', ')}`;
    }

    if (userData.experience < 0 || userData.experience > 50) {
        return 'Experience must be between 0 and 50 years';
    }

    return null;
};

//Production Salary Algorithm
const calculateSalaryProgression = (userData) => {
    logger.info(' Calculating enhanced salary progression for:', userData.targetRole);

    // Use user's actual salary OR calculate based on experience
    const currentSalary = userData.currentSalary || calculateCurrentSalary(userData);

    // Calculate target based on REAL market data
    const targetSalary = calculateTargetSalary(userData, currentSalary);

    // Generate realistic progression
    const progression = generateRealisticProgression(currentSalary, targetSalary, userData);

    // Generate market insights
    const marketInsights = generateMarketInsights(userData, currentSalary, targetSalary);

    return {
        current: currentSalary,
        target: targetSalary,
        currency: 'INR',
        unit: 'LPA',
        progression: progression,
        growthPercentage: Math.round(((targetSalary - currentSalary) / currentSalary) * 100),
        marketInsights: marketInsights,
        recommendedCities: getTopPayingCities(userData.targetRole),
        growthStrategy: getGrowthStrategy(userData)
    };
};

//  Calculate current salary based on experience and role
const calculateCurrentSalary = (userData) => {
    const experience = userData.experience || 1;
    const currentRole = userData.currentRole?.toLowerCase() || '';

    // Real market data for India 2024
    const experienceRates = {
        '0-1': { min: 4, max: 8, avg: 6 },
        '1-3': { min: 8, max: 15, avg: 12 },
        '3-5': { min: 15, max: 25, avg: 20 },
        '5+': { min: 25, max: 40, avg: 32 }
    };

    let experienceLevel;
    if (experience <= 1) experienceLevel = '0-1';
    else if (experience <= 3) experienceLevel = '1-3';
    else if (experience <= 5) experienceLevel = '3-5';
    else experienceLevel = '5+';

    return experienceRates[experienceLevel].avg;
};

//  Calculate target salary based on market data
const calculateTargetSalary = (userData, currentSalary) => {
    const targetRole = userData.targetRole?.toLowerCase() || '';
    const experience = userData.experience || 1;

    // REAL market rates for India 2024 (based on industry surveys)
    const roleMarketRates = {
        'senior': { min: 20, max: 35, avg: 28 },
        'lead': { min: 30, max: 50, avg: 40 },
        'manager': { min: 35, max: 60, avg: 48 },
        'architect': { min: 40, max: 70, avg: 55 },
        'ai': { min: 25, max: 45, avg: 35 },
        'data': { min: 22, max: 40, avg: 31 },
        'fullstack': { min: 18, max: 35, avg: 26 },
        'frontend': { min: 16, max: 30, avg: 23 },
        'backend': { min: 17, max: 32, avg: 24 },
        'devops': { min: 20, max: 38, avg: 29 }
    };

    // Find the best matching role
    const matchedRole = Object.keys(roleMarketRates).find(role =>
        targetRole.includes(role)
    ) || 'fullstack';

    let target = roleMarketRates[matchedRole].avg;

    // Apply skill multipliers
    const skillMultiplier = calculateSkillMultiplier(userData.currentSkills || []);
    target = Math.round(target * skillMultiplier);

    // Ensure realistic growth (minimum 50% increase from current)
    const minRealisticTarget = Math.round(currentSalary * 1.5);
    return Math.max(target, minRealisticTarget);
};

//  Calculate skill-based salary boost
const calculateSkillMultiplier = (skills) => {
    const premiumSkills = {
        'machine learning': 1.3,
        'artificial intelligence': 1.3,
        'ai/ml': 1.3,
        'blockchain': 1.25,
        'cloud architecture': 1.2,
        'aws': 1.15,
        'azure': 1.15,
        'docker': 1.1,
        'kubernetes': 1.15,
        'devops': 1.2,
        'system design': 1.15,
        'microservices': 1.1,
        'react': 1.05,
        'node.js': 1.05,
        'python': 1.05,
        'typescript': 1.05
    };

    let multiplier = 1.0;
    skills.forEach(skill => {
        const skillLower = skill.toLowerCase();
        Object.entries(premiumSkills).forEach(([premiumSkill, skillMultiplier]) => {
            if (skillLower.includes(premiumSkill)) {
                multiplier *= skillMultiplier;
            }
        });
    });

    return Math.min(multiplier, 1.5); // Cap at 50% boost
};
//  Generate realistic salary progression
const generateRealisticProgression = (current, target, userData) => {
    const totalGrowth = target - current;
    return [
        {
            timeline: '6 months',
            amount: Math.round(current + (totalGrowth * 0.3)),
            role: 'Skill Building Phase',
            description: 'Focus on core skills and small projects'
        },
        {
            timeline: '1 year',
            amount: Math.round(current + (totalGrowth * 0.6)),
            role: 'Intermediate Level',
            description: 'Apply skills in real projects and gain experience'
        },
        {
            timeline: '2 years',
            amount: target,
            role: userData.targetRole,
            description: 'Target role achievement with full skill set'
        }
    ];
};
//  Generate market insights
const generateMarketInsights = (userData, current, target) => {
    const growth = Math.round(((target - current) / current) * 100);
    const targetRole = userData.targetRole;

    const insights = [
        `Based on current market trends for ${targetRole} roles in India`,
        `Your growth potential: ${growth}% over 2 years`,
        `Focus on high-demand skills to maximize salary potential`
    ];

    if (userData.currentSkills?.length > 0) {
        insights.push(`Your current skills provide a solid foundation for this transition`);
    }
    return insights.join('. ');
};
//  Get top paying cities for the target role
const getTopPayingCities = (targetRole) => {
    const cityData = {
        'Bangalore': { multiplier: 1.2, description: 'Tech hub with highest salaries' },
        'Hyderabad': { multiplier: 1.1, description: 'Growing tech ecosystem' },
        'Pune': { multiplier: 1.0, description: 'Established IT industry' },
        'Chennai': { multiplier: 0.9, description: 'Cost-effective with good opportunities' },
        'Delhi/NCR': { multiplier: 1.15, description: 'Mix of startups and MNCs' }
    };

    return Object.entries(cityData).map(([city, data]) => ({
        city,
        multiplier: data.multiplier,
        description: data.description
    }));
};
//  Get growth strategy recommendations
const getGrowthStrategy = (userData) => {
    const targetRole = userData.targetRole?.toLowerCase() || '';
    const strategies = {
        'skill': 'Focus on mastering 2-3 high-demand technologies',
        'projects': 'Build portfolio projects that demonstrate expertise',
        'networking': 'Connect with professionals in target companies',
        'certifications': 'Get relevant certifications to validate skills',
        'interview': 'Practice system design and coding interviews'
    };
    return strategies;
};
//  Updated enhance function
const enhanceWithCalculatedData = (aiRoadmap, userData) => {
    logger.info(' Enhancing roadmap with PRODUCTION data');

    const enhanced = { ...aiRoadmap };

    // REPLACE AI salaries with our enhanced algorithm
    enhanced.salaryGrowth = calculateSalaryProgression(userData);

    // Initialize progress tracking
    enhanced.progressTracker = {
        overall: 0,
        careerPath: 0,
        skillGaps: 0,
        salaryGrowth: 0,
        roleTransition: 0,
        learningPath: 0,
        lastUpdated: new Date()
    };

    return enhanced;
};

// Updated document creation
const createRoadmapDocument = async (userId, userData, roadmapData) => {
    logger.info('Creating roadmap document for user:', userId);

    const roadmapDoc = new RoadMap({
        userId: userId,
        formData: {
            name: userData.name,
            current_status: userData.currentRole,  // Map to current_status
            interests: userData.targetRole,        // Map to interests
            goals: userData.goals,
            time_per_week: userData.timeCommitment, // Map to time_per_week
            learning_style: userData.learningStyle, // Map to learning_style
            tech_experience: userData.experience,   // Map to tech_experience
            currentSkills: userData.currentSkills || []
        },
        userProfile: {
            name: userData.name,
            currentRole: userData.currentRole,
            targetRole: userData.targetRole,
            experience: userData.experience,
            currentSkills: userData.currentSkills || [],
            currentSalary: userData.currentSalary || null, //  Store user's salary
            goals: userData.goals,
            timeCommitment: userData.timeCommitment,
            learningStyle: userData.learningStyle,
            location: userData.location || 'India'
        },
        careerPath: roadmapData.careerPath,
        skillGaps: roadmapData.skillGaps,
        salaryGrowth: roadmapData.salaryGrowth, // Now contains enhanced algorithm data
        roleTransition: roadmapData.roleTransition,
        learningPath: roadmapData.learningPath,
        progressTracker: roadmapData.progressTracker,
        metadata: {
            aiModel: 'gemini-1.5-flash',
            version: '2.0',
            generatedAt: new Date(),
            isActive: true,
            salaryAlgorithm: 'enhanced-market-v1' //  Track which algorithm we used
        }
    });

    const savedDoc = await roadmapDoc.save();
    logger.info('Roadmap document saved with ID:', savedDoc._id);
    return savedDoc;
};

//  ENHANCED: Update API call to use user's salary
const generateCareerRoadmap = async (req, res) => {
    try {
        logger.info(' START: generateCareerRoadmap called');

        const userId = req.user?.id || req.userId || 'temp-user-' + Date.now();
        const userData = req.body;

        logger.info('User ID:', userId);
        logger.info('User Data:', userData);

        // Validate user data
        const validationError = validateUserData(userData);
        if (validationError) {
            logger.warn('Validation failed:', validationError);
            return res.status(400).json({
                success: false,
                error: validationError
            });
        }

        logger.info(' Validation passed');

        // Generate AI roadmap (for other features)
        logger.info('Calling Gemini Service...');
        const aiRoadmap = await GeminiService.generateCareerRoadmap(userData);
        logger.info(' AI Roadmap received');

        // Enhance with PRODUCTION salary data
        const enhancedRoadmap = enhanceWithCalculatedData(aiRoadmap, userData);
        logger.info(' Roadmap enhanced with production algorithm');

        // Save to database
        const roadmapDoc = await createRoadmapDocument(userId, userData, enhancedRoadmap);
        try {
            // DELETE OLD ROADMAP MEMORIES FIRST
            const Memory = (await import("../models/Memory.js")).default;
            await Memory.deleteMany({
                userId,
                type: { $in: ["career_goal", "current_skills", "roadmap_progress"] }
            });



            // Career Goal
            await saveMemory(userId,
                `Career Goal: ${userData.targetRole} at ${userData.goals}. Experience: ${userData.experience} years.`,
                "career_goal"
            );

            // Current Skills  
            const skillsText = userData.currentSkills?.join(", ") || "No skills listed";
            await saveMemory(userId,
                `Current Skills: ${skillsText}`,
                "current_skills"
            );

            // Roadmap Progress
            await saveMemory(userId,
                `Learning Path: ${enhancedRoadmap.learningPath?.resources?.length || 0} resources. Target Salary: ${enhancedRoadmap.salaryGrowth?.target} LPA.`,
                "roadmap_progress"
            );

            logger.info("Smart RAG memory updated successfully!");
        } catch (memError) {
            logger.error("Memory saving failed:", memError);
        }


        logger.info('Database saved');

        // Return success response
        res.status(201).json({
            success: true,
            message: 'Career roadmap generated successfully',
            roadmap: enhancedRoadmap,
            roadmapId: roadmapDoc._id,
            metadata: {
                generatedAt: new Date(),
                model: 'gemini-1.5-flash',
                version: '2.0',
                salaryAlgorithm: 'enhanced-market-v1'
            }
        });

        logger.info(' SUCCESS: Production roadmap generation completed');

    } catch (error) {
        logger.error('FINAL ERROR: Career roadmap generation failed:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to generate career roadmap',
            details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
};

const getCareerRoadmap = async (req, res) => {
    try {
        logger.info('uest user:', req.user);
        logger.info(' Request userId:', req.userId);

        const userId = req.user?.id || req.userId;
        const { roadmapId } = req.params;

        logger.info(' Using userId:', userId);
        logger.info('Looking for roadmap:', roadmapId);

        // FIX: Use userId instead of userId
        const roadmap = await RoadMap.findOne({
            _id: roadmapId,
            userId: userId, // ← CHANGE THIS LINE
            $or: [
                { 'metadata.isActive': true },
                { 'metadata.isActive': { $exists: false } }
            ]
        });

        logger.info(' Found roadmap:', roadmap ? 'YES' : 'NO');

        if (!roadmap) {
            logger.warn(' Roadmap not found. Possible reasons:');
            logger.warn('   - Wrong roadmap ID');
            logger.warn('   - User ID mismatch');
            logger.warn('   - Roadmap not active');
            return res.status(404).json({
                success: false,
                error: 'Career roadmap not found'
            });
        }

        await roadmap.calculateAllProgress();

        res.json({
            success: true,
            roadmap: {
                roadmapId: roadmap._id,
                roadmapData: {
                    careerPath: roadmap.careerPath,
                    skillGaps: roadmap.skillGaps,
                    salaryGrowth: roadmap.salaryGrowth,
                    roleTransition: roadmap.roleTransition,
                    learningPath: roadmap.learningPath,
                    progressTracker: roadmap.progressTracker,
                    metadata: roadmap.metadata,
                },
                formValues: roadmap.formData
            }
        });

    } catch (error) {
        logger.error('Get roadmap failed:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch career roadmap'
        });
    }
};
const getUserRoadmaps = async (req, res) => {
    try {
        const userId = req.user?.id || req.userId;

        if (!userId) {
            return res.status(400).json({
                success: false,
                error: 'User ID not found in request'
            });
        }

        const roadmaps = await RoadMap.find({
            userId: userId,
            $or: [
                { 'metadata.isActive': true },
                { 'metadata.isActive': { $exists: false } }
            ]
        }).sort({ 'metadata.generatedAt': -1 });

        const formattedRoadmaps = roadmaps.map(roadmap => {
            // Use formData which now has all the mapped fields
            const formData = roadmap.formData || {};

            return {
                id: roadmap._id,
                name: formData.name || 'Career Journey',
                currentRole: formData.current_status || 'Current Role',  // Use current_status
                targetRole: formData.interests || 'Target Role',         // Use interests
                progress: roadmap.progressTracker?.overall || 0,
                createdAt: roadmap.metadata?.generatedAt || roadmap.createdAt,
                timeline: roadmap.careerPath?.timeline || 'Flexible timeline',
                experience: formData.tech_experience || 'Not specified', // Use tech_experience
                skillsCount: formData.currentSkills?.length || 0
            };
        });

        res.json({
            success: true,
            roadmaps: formattedRoadmaps
        });

    } catch (error) {
        logger.error('Get user roadmaps failed:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch user roadmaps'
        });
    }
};

const updateProgress = async (req, res) => {
    try {
        const { userId } = req;
        const { roadmapId } = req.params;
        const { updates } = req.body;

        const roadmap = await RoadMap.findOne({
            _id: roadmapId,
            userId: userId
        });

        if (!roadmap) {
            return res.status(404).json({
                success: false,
                error: 'Roadmap not found'
            });
        }

        roadmap.progressTracker.lastUpdated = new Date();
        await roadmap.save();

        res.json({
            success: true,
            message: 'Progress updated successfully',
            progress: roadmap.progressTracker
        });

    } catch (error) {
        logger.error(' Progress update failed:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update progress'
        });
    }
};

const deleteCareerRoadmap = async (req, res) => {
    try {
        logger.info(' [DELETE ROADMAP] Starting...');

        const userId = req.user?.id || req.userId;
        const { roadmapId } = req.params;

        logger.info(' Deleting roadmap:', roadmapId, 'for user:', userId);

        if (!userId) {
            return res.status(400).json({
                success: false,
                error: 'User ID not found in request'
            });
        }

        // Find the roadmap first to verify ownership
        const roadmap = await RoadMap.findOne({
            _id: roadmapId,
            userId: userId
        });

        logger.info(' Roadmap found:', roadmap ? 'YES' : 'NO');

        if (!roadmap) {
            logger.warn('Roadmap not found or access denied');
            return res.status(404).json({
                success: false,
                error: 'Career roadmap not found or you do not have permission to delete it'
            });
        }

        // Delete the roadmap
        const result = await RoadMap.deleteOne({
            _id: roadmapId,
            userId: userId
        });

        logger.info(' Delete result:', result);

        if (result.deletedCount === 0) {
            return res.status(404).json({
                success: false,
                error: 'Roadmap not found'
            });
        }

        logger.info(' Roadmap deleted successfully');
        res.json({
            success: true,
            message: 'Career roadmap deleted successfully',
            deletedRoadmapId: roadmapId
        });

    } catch (error) {
        logger.error(' Delete roadmap failed:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete career roadmap',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Export all functions
export default {
    generateCareerRoadmap,
    getCareerRoadmap,
    getUserRoadmaps,
    updateProgress,
    deleteCareerRoadmap
};