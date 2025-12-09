// services/geminiService.js
import logger from '../utils/logger.js'; // ADD THIS

class GeminiService {
  constructor() {
    this.GROQ_API_KEY = process.env.GROQ_API_KEY;
    this.GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
  }

  async generateCareerRoadmap(userData) {
    try {
      logger.info('START: generateCareerRoadmap called'); // CHANGED
      logger.info('User ID:', userData?.id || '(no id)'); // CHANGED
      logger.info('User Data:', userData); // CHANGED

      // If no API key, return mock data
      if (!this.GROQ_API_KEY || this.GROQ_API_KEY === 'your-api-key-here') {
        logger.info(' Using mock data - No API key found'); // CHANGED
        return this.getMockRoadmapData(userData);
      }

      const prompt = this.createCareerPrompt(userData);
      logger.info(' Prompt sent to AI'); // CHANGED
      const response = await this.callGeminiAPI(prompt);

      logger.info(' AI Response received'); // CHANGED

      // Robust parsing & normalization (core fix)
      const parsed = this.safeParseRoadmapFromResponse(response);

      if (!parsed) {
        logger.warn('Parsed result is null — falling back to mock data'); // CHANGED
        return this.getMockRoadmapData(userData);
      }

      const normalized = this.normalizeFinalStructure(parsed);

      // Validate essential pieces minimally before returning
      if (!this.validateRoadmap(normalized)) {
        logger.warn('Validation failed after normalization — falling back to mock data'); // CHANGED
        logger.info('Normalized object snapshot:', JSON.stringify(normalized).slice(0, 2000)); // CHANGED
        return this.getMockRoadmapData(userData);
      }

      logger.info('AI Roadmap parsed and normalized successfully'); // CHANGED
      return normalized;

    } catch (error) {
      logger.error('Groq API Error:', error); // CHANGED
      logger.info(' Falling back to mock data'); // CHANGED
      return this.getMockRoadmapData({});
    }
  }

  async callGeminiAPI(prompt) {
    const response = await fetch(this.GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
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

  // ---------- Robust parse & repair ----------
  safeParseRoadmapFromResponse(response) {
    try {
      const rawText = response?.choices?.[0]?.message?.content;
      if (!rawText) {
        logger.warn('No text returned from Gemini response'); // CHANGED
        return null;
      }

      // log limited preview for debug
      logger.info(' Raw AI response length:', rawText.length); // CHANGED
      logger.info(' Raw preview:', rawText.substring(0, 500)); // CHANGED

      // Step 0: remove markdown fences
      let text = rawText.replace(/```(?:json)?/g, '').trim();

      // Step 1: try to parse entire text directly
      const direct = this.tryJsonParse(text);
      if (direct) return direct;

      // Step 2: try to extract first JSON object block
      const match = text.match(/\{[\s\S]*\}/);
      let candidate = match ? match[0] : text;

      // Step 3: attempt layered fixes and parse attempts
      const attempts = [
        candidate,
        this.quickFixCommonIssues(candidate),
        this.removeTrailingCommas(candidate),
        this.unescapeJsonString(candidate),
        this.quickFixCommonIssues(this.unescapeJsonString(candidate))
      ];

      for (const a of attempts) {
        const p = this.tryJsonParse(a);
        if (p) return p;
      }

      // Step 4: if still failing, try to find the learningPath block specifically and repair that,
      // then reconstruct a minimal object (best-effort)
      const lpRepair = this.attemptLearningPathRepair(text);
      if (lpRepair) return lpRepair;

      // Nothing worked
      logger.error('All parse attempts failed. Raw AI text logged for inspection.'); // CHANGED
      logger.error('---- RAW AI START ----\n' + rawText.substring(0, 8000) + '\n---- RAW AI END ----'); // CHANGED
      return null;

    } catch (err) {
      logger.error('safeParseRoadmapFromResponse failed:', err); // CHANGED
      return null;
    }
  }

  tryJsonParse(s) {
    try {
      return JSON.parse(s);
    } catch (_) {
      return null;
    }
  }

  // Naive common fixes: quote keys, convert single quotes, true/false/null lowercasing
  quickFixCommonIssues(s) {
    let out = s;

    // Replace unquoted keys: { key:  -> { "key":
    out = out.replace(/([{,]\s*)([A-Za-z0-9_]+)\s*:/g, '$1"$2":');

    // Replace single quotes with double quotes (best-effort)
    // Avoid touching contractions is tricky; we accept some risk but this helps common broken JSON
    out = out.replace(/([\s:\[,])'([^']*)'/g, '$1"$2"');

    // Replace standalone single quotes (fallback)
    out = out.replace(/'/g, '"');

    // True/False/None -> true/false/null
    out = out.replace(/\bTrue\b/g, 'true').replace(/\bFalse\b/g, 'false').replace(/\bNone\b/g, 'null');

    // Remove common "explanatory" lines like "Note:" if present inside JSON accidentally
    out = out.replace(/\n?\s*Note:.*$/gmi, '');

    return out;
  }

  // Remove trailing commas before } or ]
  removeTrailingCommas(s) {
    return s.replace(/,(\s*[}\]])/g, '$1');
  }

  // Unescape sequences when AI returns JSON as a stringified string
  unescapeJsonString(s) {
    // Remove wrapping quotes if entire JSON is wrapped in quotes
    let out = s.trim();
    if ((out.startsWith('"') && out.endsWith('"')) || (out.startsWith("'") && out.endsWith("'"))) {
      out = out.slice(1, -1);
    }
    // Replace escaped quotes
    out = out.replace(/\\"/g, '"').replace(/\\'/g, "'");
    return out;
  }

  // Attempt to repair learningPath when only that block is broken; returns a minimal object if successful
  attemptLearningPathRepair(fullText) {
    try {
      // try to find learningPath JSON block
      const lpMatch = fullText.match(/"learningPath"\s*:\s*\{[\s\S]*?\}\s*(,|\})/);
      if (!lpMatch) return null;

      let lpText = lpMatch[0];
      // Surround with braces to attempt parse
      const pseudo = `{ ${lpText} }`;
      let fixed = this.quickFixCommonIssues(pseudo);
      fixed = this.removeTrailingCommas(fixed);

      const parsedPseudo = this.tryJsonParse(fixed);
      if (!parsedPseudo) return null;

      // Build fallback minimal roadmap object using the repaired learningPath
      const minimal = {
        careerPath: { timeline: "18 months", phases: [] },
        skillGaps: {
          currentSkills: [], requiredSkills: [], missingSkills: [], prioritySkills: [], matchPercentage: 0, analysis: ""
        },
        salaryGrowth: { current: 0, progression: [], target: 0, growthPercentage: 0, currency: "INR", unit: "LPA" },
        roleTransition: { steps: [], totalDuration: "", successRate: "" },
        learningPath: parsedPseudo.learningPath || { resources: [] }
      };

      return minimal;
    } catch (e) {
      return null;
    }
  }

  // ---------- Normalization: learningPath.resources MUST be array of objects ----------
  normalizeFinalStructure(data) {
    try {
      if (!data || typeof data !== 'object') return this.getMockRoadmapData({});

      // Ensure top-level sections exist to avoid runtime errors later
      if (!data.careerPath) data.careerPath = { timeline: "18 months", phases: [] };
      if (!data.skillGaps) data.skillGaps = {
        currentSkills: [], requiredSkills: [], missingSkills: [], prioritySkills: [], matchPercentage: 0, analysis: ""
      };
      if (!data.salaryGrowth) data.salaryGrowth = { current: 0, progression: [], target: 0, growthPercentage: 0, currency: "INR", unit: "LPA" };
      if (!data.roleTransition) data.roleTransition = { steps: [], totalDuration: "", successRate: "" };
      if (!data.learningPath) data.learningPath = { resources: [], progress: 0 };

      // Normalize resources into array
      let resources = data.learningPath.resources;

      // If string that contains JSON array: try parse it
      if (typeof resources === 'string') {
        const trimmed = resources.trim();

        // Try parse stringified JSON array first
        const parsedStringJson = this.tryJsonParse(trimmed);
        if (Array.isArray(parsedStringJson)) {
          resources = parsedStringJson;
        } else {
          // If string looks like "[{...}]" with escaped quotes
          try {
            const unescaped = this.unescapeJsonString(trimmed);
            const attempt = this.tryJsonParse(unescaped);
            if (Array.isArray(attempt)) resources = attempt;
          } catch (_) {
            // continue
          }
        }

        // If still a plain descriptive string, split into lines or by semicolon/comma heuristics
        if (typeof resources === 'string') {
          const parts = trimmed.split(/\r?\n|;|---/).map(p => p.trim()).filter(Boolean);
          if (parts.length > 1) {
            resources = parts;
          } else {
            // fallback: split by comma only if it's a simple comma-separated short list (avoid splitting long sentences)
            if (trimmed.length < 400 && trimmed.includes(',')) {
              resources = trimmed.split(',').map(p => p.trim()).filter(Boolean);
            } else {
              // single descriptive resource
              resources = [trimmed];
            }
          }
        }
      }

      // If it's an object (single resource), wrap in array
      if (resources && !Array.isArray(resources) && typeof resources === 'object') {
        resources = [resources];
      }

      // If not an array at this point, set empty array
      if (!Array.isArray(resources)) {
        resources = [];
      }

      // Normalize each entry into the exact object shape required by DB
      const normalizedResources = resources.map(item => {
        // If it's an object -> pick fields (and coerce types)
        if (item && typeof item === 'object') {
          return {
            name: String(item.name || item.title || item.resource || item.name === 0 ? item.name : "") || "",
            url: String(item.url || item.link || "") || "",
            type: String(item.type || item.kind || "") || "",
            duration: String(item.duration || item.time || "") || "",
            difficulty: String(item.difficulty || item.level || "") || "",
            phase: String(item.phase || item.phaseName || item.phase_title || "") || ""
          };
        }

        // If item is string -> create object with name
        if (typeof item === 'string') {
          // Try to extract URL from string
          const urlMatch = item.match(/(https?:\/\/[^\s,]+)/);
          return {
            name: item.replace(urlMatch ? urlMatch[0] : '', '').trim().slice(0, 500),
            url: urlMatch ? urlMatch[0] : "",
            type: "",
            duration: "",
            difficulty: "",
            phase: ""
          };
        }

        // fallback
        return { name: "", url: "", type: "", duration: "", difficulty: "", phase: "" };
      });

      data.learningPath.resources = normalizedResources;
      if (typeof data.learningPath.progress !== 'number') data.learningPath.progress = 0;

      return data;
    } catch (err) {
      logger.error('normalizeFinalStructure error:', err); // CHANGED
      return this.getMockRoadmapData({});
    }
  }

  // Minimal validator: ensures learningPath.resources is array of objects with at least name field (can be empty)
  validateRoadmap(data) {
    try {
      if (!data || typeof data !== 'object') return false;
      if (!Array.isArray(data.learningPath?.resources)) return false;
      // ensure each resource is object and has 'name' key (string)
      for (const r of data.learningPath.resources) {
        if (!r || typeof r !== 'object') return false;
        if (!('name' in r)) return false;
      }
      return true;
    } catch {
      return false;
    }
  }


  getMockRoadmapData(userData) {
    return {
      careerPath: {
        timeline: "18 months",
        phases: [
          {
            name: "Phase 1: AI Foundation (Months 1-3)",
            description: "Build programming and AI fundamentals",
            focus: "Python & ML Basics",
            duration: "3 months",
            milestones: ["Complete Python course", "Learn basic statistics", "Understand ML concepts"],
            skillsToLearn: ["Python", "Statistics", "Machine Learning Basics"],
            projects: ["Data analysis project", "Basic prediction model"],
            resources: ["Python courses", "ML tutorials"]
          },
          {
            name: "Phase 2: Advanced AI (Months 4-9)",
            description: "Master AI frameworks and build complex projects",
            focus: "Deep Learning & AI Frameworks",
            duration: "6 months",
            milestones: ["Learn TensorFlow/PyTorch", "Build neural networks", "Complete 2 AI projects"],
            skillsToLearn: ["Deep Learning", "TensorFlow", "PyTorch", "Neural Networks"],
            projects: ["Image classification system", "NLP chatbot"]
          },
          {
            name: "Phase 3: Specialization (Months 10-18)",
            description: "Focus on AI engineering and deployment",
            focus: "AI Engineering & MLOps",
            duration: "9 months",
            milestones: ["Learn MLOps", "Deploy AI models", "Build portfolio"],
            skillsToLearn: ["MLOps", "Cloud AI Services", "Model Deployment"],
            projects: ["End-to-end AI application", "Cloud-deployed model"]
          }
        ]
      },
      skillGaps: {
        currentSkills: ["Basic programming"],
        requiredSkills: ["Python", "Machine Learning", "Deep Learning", "TensorFlow", "PyTorch", "MLOps"],
        missingSkills: ["Machine Learning", "Deep Learning", "TensorFlow", "PyTorch", "MLOps"],
        prioritySkills: ["Python", "Machine Learning", "Deep Learning"],
        matchPercentage: 20,
        analysis: "Good foundation in programming but need comprehensive AI/ML skills development"
      },
      salaryGrowth: {
        current: 4,
        progression: [
          { "timeline": "6 months", "amount": 8, "role": "AI Trainee" },
          { "timeline": "1 year", "amount": 15, "role": "Junior AI Engineer" },
          { "timeline": "18 months", "amount": 25, "role": "AI Engineer" }
        ],
        target: 25,
        growthPercentage: 525,
        currency: "INR",
        unit: "LPA"
      },
      roleTransition: {
        steps: [
          {
            step: 1,
            title: "Master Programming & Math Fundamentals",
            description: "Build strong foundation in Python, statistics, and linear algebra",
            duration: "3 months",
            tasks: ["Complete Python programming course", "Learn statistics basics", "Study linear algebra"],
            priority: "high"
          },
          {
            step: 2,
            title: "Learn Machine Learning Concepts",
            description: "Understand core ML algorithms and data preprocessing",
            duration: "3 months",
            tasks: ["Study ML algorithms", "Practice with datasets", "Learn data preprocessing"],
            priority: "high"
          },
          {
            step: 3,
            title: "Build AI Projects",
            description: "Create practical AI applications for your portfolio",
            duration: "6 months",
            tasks: ["Build 2-3 AI projects", "Learn TensorFlow/PyTorch", "Join AI communities"],
            priority: "medium"
          }
        ],
        totalDuration: "12-18 months",
        successRate: "85%",
        challenges: ["Complex mathematics", "Rapid technology changes", "Compute resources"],
        opportunities: ["High industry demand", "Remote work options", "Continuous learning"]
      },
      learningPath: {
        resources: [
          "Python for Data Science and Machine Learning",
          "Machine Learning A-Z on Udemy",
          "Deep Learning Specialization by Andrew Ng",
          "TensorFlow Official Documentation",
          "Practical AI project tutorials"
        ]
      }
    };
  }


  createCareerPrompt(userData) {
    return `You are CareerGPT, an expert AI career advisor. Create a detailed, realistic career roadmap for transitioning to ${userData.targetRole}.

USER PROFILE:
- Current Role: ${userData.currentRole}
- Current Skills: ${Array.isArray(userData.currentSkills) ? userData.currentSkills.join(', ') : userData.currentSkills}
- Target Role: ${userData.targetRole}
- Experience: ${userData.experience} years
- Goals: ${userData.goals}
- Time Commitment: ${userData.timeCommitment} hours/week
- Learning Style: ${userData.learningStyle}
- Location: ${userData.location}

Generate a COMPREHENSIVE but REALISTIC career roadmap with this EXACT JSON structure:

{
  "careerPath": {
    "timeline": "18 months",
    "phases": [
      {
        "name": "Phase 1: Foundation (Months 1-3)",
        "description": "Brief description",
        "focus": "Main focus area",
        "duration": "3 months",
        "milestones": ["Milestone 1", "Milestone 2"],
        "skillsToLearn": ["Skill 1", "Skill 2"],
        "projects": ["Project 1", "Project 2"],
        
      }
    ]
  },
  "skillGaps": {
    "currentSkills": ${JSON.stringify(userData.currentSkills)},
    "requiredSkills": ["Skill C", "Skill D"],
    "missingSkills": ["Skill C", "Skill D"],
    "prioritySkills": ["Skill C"],
    "matchPercentage": 25,
    "analysis": "Brief analysis text"
  },
  "salaryGrowth": {
    "current": 4,
    "progression": [
      {"timeline": "6 months", "amount": 8, "role": "Role A"},
      {"timeline": "1 year", "amount": 15, "role": "Role B"}
    ],
    "target": 25,
    "growthPercentage": 525,
    "currency": "INR",
    "unit": "LPA"
  },
  "roleTransition": {
    "steps": [
      {
        "step": 1,
        "title": "Step title",
        "description": "Step description",
        "duration": "3 months",
        "tasks": ["Task 1", "Task 2"],
        "priority": "high"
      }
    ],
    "totalDuration": "12-18 months",
    "successRate": "85%",
    "challenges": ["Challenge 1", "Challenge 2"],
    "opportunities": ["Opportunity 1", "Opportunity 2"]
  },
  "learningPath": {
    "resources": [
      {
        "name": "Resource name (be specific and realistic)",
        "url": "Real website URL (provide actual links, not placeholder)",
        "type": "video/course/book/documentation",
        "duration": "Realistic time estimate (e.g., '2-4 weeks')", 
        "difficulty": "Beginner/Intermediate/Advanced",
        "phase": "Phase name from careerPath.phases"
      }
    ]
  }
 
}

IMPORTANT: Return ONLY valid JSON. No additional text, no code blocks, no explanations.`;
  }

  // original parseAIResponse left intact for compatibility but improved by safe parser above
  parseAIResponse(response) {
    try {
      logger.info("Parsing AI response..."); // CHANGED

      const text = response.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        logger.info("No text in response"); // CHANGED
        return this.getMockRoadmapData({});
      }

      let clean = text.replace(/```json|```/g, "").trim();

      // 1. Try normal parse
      try {
        return JSON.parse(clean.match(/\{[\s\S]*\}/)[0]);
      } catch (e) {
        logger.info("Normal parse failed, repairing JSON..."); // CHANGED
      }

      // 2. Repair incomplete last string or URL
      clean = clean.replace(/"url":\s*"([^"]*)$/, '"url": "$1" }');

      // 3. Ensure all objects are properly closed
      let openBraces = (clean.match(/\{/g) || []).length;
      let closeBraces = (clean.match(/\}/g) || []).length;
      while (closeBraces < openBraces) {
        clean += "}";
        closeBraces++;
      }

      // 4. Fix trailing commas
      clean = clean.replace(/,\s*}/g, "}")
        .replace(/,\s*]/g, "]");

      // 5. Try parse again
      try {
        const repaired = JSON.parse(clean.match(/\{[\s\S]*\}/)[0]);

        // ENFORCE learningPath.resources ARRAY
        if (repaired.learningPath && !Array.isArray(repaired.learningPath.resources)) {
          logger.info("Fixing learningPath.resources (forcing array)"); // CHANGED
          repaired.learningPath.resources = [];
        }

        return repaired;

      } catch (e) {
        logger.info("Repaired JSON failed"); // CHANGED
      }

      logger.info("Falling back to mock data"); // CHANGED
      return this.getMockRoadmapData({});

    } catch (error) {
      logger.info("JSON parsing failed:", error.message); // CHANGED
      return this.getMockRoadmapData({});
    }
  }

}

export default new GeminiService();