import express from 'express';
import Chat from '../models/Chat.js';
import axios from "axios";
import dotenv from 'dotenv';
import { searchMemory } from "../services/memoryService.js";
import { createEmbedding } from "../services/embeddingService.js";
import logger from '../utils/logger.js';


dotenv.config();

// Global connection tracking
const activeConnections = new Map();

// Gemini API configuration
const GROQ_API_KEY = process.env.GROQ_API_KEY
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MAX_MESSAGES_PER_CHAT = 50;

// Helper function to save partial responses
async function savePartialResponse(chatId, userId, responseText) {
    try {
        await Chat.findOneAndUpdate(
            { _id: chatId, userId },
            {
                $push: {
                    messages: {
                        role: "assistant",
                        text: responseText,
                        stopped: true,
                        partial: true
                    }
                }
            },
            { new: true, runValidators: true }
        );
    } catch (dbError) {
        logger.error("Error saving partial response:", dbError);
    }
}

// Cleanup stale connections
setInterval(() => {
    const now = Date.now();
    for (const [connectionId, connection] of activeConnections) {
        if (now - connection.createdAt > 300000) {
            connection.controller.abort();
            if (connection.responseText) {
                savePartialResponse(connection.chatId, connection.userId, connection.responseText);
            }
            activeConnections.delete(connectionId);
        }
    }
}, 60000);

export const createChat = async (req, res) => {
    try {
        const { title } = req.body;
        const newChat = new Chat({
            userId: req.user.id,
            title: title || "Untitled Chat",
        })
        await newChat.save();
        res.status(201).json(newChat);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
}

export const getAllChats = async (req, res) => {
    try {
        const chats = await Chat.find({ userId: req.user.id }).sort({ updatedAt: -1 });
        res.status(200).json(chats);
    }
    catch (error) {
        res.status(500).json({ error: error.message })
    }
}

export const getChatById = async (req, res) => {
    try {
        const chat = await Chat.findOne({ _id: req.params.id, userId: req.user.id });
        if (!chat) return res.status(404).json({ message: "Chat not found" });
        res.status(200).json(chat);
    }
    catch (error) {
        res.status(500).json({ error: error.message })
    }
}
export const addMessageToChat = async (req, res) => {
    let heartbeat;
    let connectionId;

    try {
        const { role, userText, files, connectionId: clientConnectionId } = req.body;
        const chatId = req.params.id;
        const userId = req.user.id;

        // Validate input
        if (!userText || userText.trim() === '') {
            return res.status(400).json({ error: "Message text is required" });
        }

        // Generate unique connection ID
        connectionId = clientConnectionId || req.headers['x-connection-id'] || `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const controller = new AbortController();

        // Get current chat BEFORE adding new message
        const existingChat = await Chat.findOne({ _id: chatId, userId });
        if (!existingChat) {
            return res.status(404).json({ message: "Chat not found" });
        }

        if (existingChat.messages.length >= MAX_MESSAGES_PER_CHAT) {
            return res.status(400).json({
                success: false,
                error: `Chat limit reached (${MAX_MESSAGES_PER_CHAT} messages). Please start a new chat.`
            });
        }

        const userMessagesBefore = existingChat.messages.filter(msg => msg.role === "user");
        const isFirstUserMessage = userMessagesBefore.length === 0 && role === "user";

        if (isFirstUserMessage) {
            try {
                let chatTitle =
                    userText.length <= 25 ? userText : userText.substring(0, 25) + "...";

                chatTitle = chatTitle.replace(/[#*`~_]/g, "").trim();

                await Chat.findOneAndUpdate(
                    { _id: chatId, userId },
                    { $set: { title: chatTitle } },
                    { new: true }
                );

                logger.info("CHAT TITLE SAVED:", chatTitle);
            } catch (titleErr) {
                logger.error(" ERROR SAVING TITLE:", titleErr);
            }
        }

        // Store connection for abort handling
        activeConnections.set(connectionId, {
            controller,
            userId,
            chatId,
            responseText: "",
            createdAt: Date.now()
        });

        //  Save user message WITH files
        let chat = await Chat.findOneAndUpdate(
            { _id: chatId, userId },
            {
                $push: {
                    messages: {
                        role,
                        text: userText,
                        files: files || [] // ← ADDED files array
                    }
                }
            },
            { new: true, runValidators: true }
        );

        // If not user → simply save message
        if (role !== "user") {
            return res.status(201).json(chat);
        }

        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache, no-transform");
        res.setHeader("Connection", "keep-alive");
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.flushHeaders();

        // Send connection ID to client
        res.write(`data: ${JSON.stringify({ type: "connection", connectionId })}\n\n`);

        // Heartbeat
        heartbeat = setInterval(() => {
            res.write(": heartbeat\n\n");
        }, 15000);

        //  last 10 messages with file content
        const last10messages = chat.messages
            .filter(msg => !(msg.stopped === true))
            .slice(-10);

        //  conversation history with file content
        const conversationHistory = last10messages
            .map(msg => {
                let messageText = '';

                // Add feedback indicator if it's an AI message with reactions
                if (msg.role === 'assistant' && msg.reactions && msg.reactions.length > 0) {
                    const userReaction = msg.reactions.find(r =>
                        r.userId && r.userId.toString() === userId.toString()
                    );

                    if (userReaction) {
                        if (userReaction.type === 'like') {
                            messageText += '[User liked this response 👍]\n';
                        } else if (userReaction.type === 'dislike') {
                            messageText += `[User disliked this response 👎`;
                            if (userReaction.dislikeReason) {
                                messageText += ` - Reason: ${userReaction.dislikeReason}`;
                                if (userReaction.customReason) {
                                    messageText += ` (${userReaction.customReason})`;
                                }
                            }
                            messageText += ']\n';
                        }
                    }
                }
                // Add file content
                if (msg.files && msg.files.length > 0) {
                    const fileContent = msg.files.map(file =>
                        `[File: ${file.filename}] ${file.extractedText || 'No text extracted'}`
                    ).join('\n');
                    messageText += `${msg.role}: ${fileContent}\nUser question: ${msg.text}`;
                } else {
                    messageText += `${msg.role}: ${msg.text}`;
                }
                return messageText;
            })
            .join("\n");
        // d prompt for current message with files
        // d prompt for current message with files
        let currentMessagePrompt = userText;
        if (files && files.length > 0) {
            const currentFileContent = files.map(file =>
                `[File: ${file.filename}] ${file.extractedText || 'No text extracted'}`
            ).join('\n');
            currentMessagePrompt = `${currentFileContent}\nUser question: ${userText}`;
        }
        let ragContextText = "";
        try {
            // searchMemory will look through all memory types for this user;
            // query uses the user's incoming message to find relevant memory
            const memories = await searchMemory(userId, userText, 3); // top-3
            if (memories && memories.length) {

                ragContextText = memories.map(m => `[${m.type}] ${m.content}`).join("\n\n---\n\n");
                logger.info("RAG: found user memory items for prompt");
            }
        } catch (e) {
            logger.warn("RAG search failed:", e?.message || e);
        }
        const fullPrompt =
            `SYSTEM INSTRUCTIONS — CAREER AI ASSISTANT

1. ROLE & PURPOSE
You are a professional Career and Interview AI Assistant built to help users:
- prepare for upcoming interviews
- understand job descriptions
- practice mock interviews
- improve resumes and professional skills
- learn any technical concept with clear, calm explanations.

2. BEHAVIOR RULES
- Always be polite, respectful, calm, and supportive.
- NEVER use rude, harsh, aggressive, or risky language.
- Maintain a human-like, friendly mentor tone.
- Address the user by name only when appropriate (not every message).
- Provide structured, concise, and helpful answers.

3. MEMORY USAGE RULES
You can ONLY use stored memory when:
- the user directly asks for their saved personal data (bio, resume, skills, experience, goals, job preferences).
If user asks for memory that does not exist, reply:
  “I don’t have that saved yet.”

Never block conversation if memory is empty.

4. RAG CONTEXT RULES (VERY IMPORTANT)
When RAG sends a “current_job_application” or “interview_context”:
- Treat it as the user's actual active interview.
- Use it to guide preparation, questions, answers, and learning material.
- Never hallucinate missing details; use only what is provided.
- Always adjust difficulty to user's experience level.

If RAG includes:
{
  "role": "...",
  "company": "...",
  "skills": [...],
  "jd_text": "...",
  "interview_stage": "..."
}
Then automatically:
- generate tailored interview questions
- explain key concepts from the JD
- provide salary expectations
- break down required skills
- and simulate mock interview rounds.

5. WHEN USER ENTERS FROM "AI PREP BUTTON"
If RAG provides a new job application (because user pressed "track-prep"):
- Assume user is preparing for that specific interview *right now*.
- Immediately switch into “Interview-Preparation Mode”.
- Begin by offering:
  - Role summary
  - What to expect in interview
  - Top 10 questions for this exact job
  - Skill gaps the user should fix
  - Mini mock interview (optional)

6. RESPONSE STYLE GUIDELINES
- Use headers, bullet points, and short paragraphs.
- Ask a clarifying question if the prompt is unclear.
- Provide examples when explaining anything technical.
- For coding questions: provide optimal + simple solution with explanation.

7. SAFETY & PROFESSIONALISM
- No medical, legal, or harmful instructions.
- Avoid making definitive claims—use "typically", "usually", "industry range", etc.
- For salary or company-sensitive info, give general market estimates.

8. CORE OBJECTIVE
Your mission:
Help the user grow in their career, become confident in interviews, and
master the skills required for their dream job—with clarity, respect,
professionalism, and real usefulness.

**IMPORTANT: If you see [User disliked previous response], apologize briefly and improve. and mostly use the emojis like chatgpt/deepseek/google ai on each response**

    ` +
            (ragContextText ? `Relevant user memory:\n${ragContextText}\n\n` : "") +
            (conversationHistory ? conversationHistory + "\n\n" : "") +
            `user: ${currentMessagePrompt}`;

        logger.info("ENHANCED PROMPT:", fullPrompt.substring(0, 200) + "...");
        try {
            const response = await fetch(GROQ_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${GROQ_API_KEY}`
                },
                body: JSON.stringify({
                    model: "llama-3.3-70b-versatile",
                    messages: [
                        {
                            role: "user",
                            content: fullPrompt
                        }
                    ],
                    stream: true,
                    temperature: 0.7,
                    max_tokens: 2048
                }),
                signal: controller.signal
            });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
            }

            if (!response.body) {
                throw new Error("No streaming body from Gemini");
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let fullResponse = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (!line.trim()) continue;
                    if (line === 'data: [DONE]') break;

                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.slice(6));

                            // GROQ FORMAT (not Gemini)
                            if (data.choices && data.choices[0] && data.choices[0].delta) {
                                const token = data.choices[0].delta.content || '';
                                if (token) {
                                    res.write(`data: ${JSON.stringify({
                                        type: "token",
                                        token: token,
                                        connectionId
                                    })}\n\n`);
                                    fullResponse += token;
                                     await new Promise(r => setTimeout(r, 10));

                                    const connection = activeConnections.get(connectionId);
                                    if (connection) connection.responseText = fullResponse;
                                }
                            }
                        } catch (e) {
                            continue;
                        }
                    }
                }
            }
            // STREAM COMPLETE
            res.write(
                `data: ${JSON.stringify({
                    type: "complete",
                    fullResponse,
                    connectionId
                })}\n\n`
            );
            // Save assistant message
            if (fullResponse.trim()) {
                await Chat.findOneAndUpdate(
                    { _id: chatId, userId },
                    { $push: { messages: { role: "assistant", text: fullResponse } } },
                    { new: true }
                );
            }
        } catch (err) {
            if (err.name === "AbortError") {
                res.write(`data: ${JSON.stringify({ type: "aborted", connectionId })}\n\n`);
            } else {
                logger.error(" STREAM ERROR:", err);
                res.write(
                    `data: ${JSON.stringify({
                        type: "error",
                        error: "AI service unavailable",
                        connectionId
                    })}\n\n`
                );
            }
        } finally {
            if (heartbeat) clearInterval(heartbeat);
            activeConnections.delete(connectionId);
            res.end();
        }
    } catch (err) {
        if (heartbeat) clearInterval(heartbeat);
        if (connectionId) activeConnections.delete(connectionId);

        logger.error("SERVER ERROR:", err);

        if (!res.headersSent) {
            res.status(500).json({ error: err.message });
        } else {
            res.write(
                `data: ${JSON.stringify({ type: "error", error: "Internal server error" })}\n\n`
            );
            res.end();
        }
    }
};


export const stopGeneration = async (req, res) => {
    try {
        const { connectionId } = req.body;
        const userId = req.user.id;

        if (!connectionId) {
            return res.status(400).json({ error: "Connection ID required" });
        }

        const connection = activeConnections.get(connectionId);
        if (connection && connection.userId === userId) {
            connection.controller.abort();
            if (connection.responseText) {
                await savePartialResponse(connection.chatId, userId, connection.responseText);
            }
            activeConnections.delete(connectionId);
            res.json({ success: true, message: "Generation stopped" });
        } else {
            res.status(404).json({ error: "Connection not found" });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const deleteChat = async (req, res) => {
    try {
        const chat = await Chat.findOneAndDelete({
            _id: req.params.id, userId: req.user.id
        })
        if (!chat) return res.status(404).json({ message: "Chat not found" });
        res.status(200).json({ message: "Chat deleted" })
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
}

export const titleChange = async (req, res) => {
    try {
        const { title } = req.body;
        const userId = req.user.id
        const chatId = req.params.id;

        if (!title?.trim()) {
            return res.status(400).json({ error: "Title required" });
        }

        const chat = await Chat.findOneAndUpdate(
            { _id: chatId, userId },
            { $set: { title } },
            { new: true, runValidators: true }
        );

        if (!chat) return res.status(404).json({ message: "Chat not found" });
        res.status(200).json({ success: true, chat });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
}

export const updateChatWithMessage = async (req, res) => {
    try {
        const { message } = req.body;
        const chatId = req.params.id;
        const userId = req.user.id;

        // Validate message has text
        if (!message?.text || message.text.trim() === '') {
            return res.status(400).json({ error: "Message text is required" });
        }

        const chat = await Chat.findOneAndUpdate(
            { _id: chatId, userId },
            { $push: { messages: message } },
            { new: true, runValidators: true }
        )

        if (!chat) return res.status(404).json({ message: "Chat not found" });
        res.status(200).json(chat);
    }
    catch (error) {
        res.status(500).json(error.message)
    }
}

export const regenerateResponse = async (req, res) => {
    try {
        const chatId = req.params.id;
        const { assistantMessageId, userMessageId } = req.body;
        const userId = req.user.id;

        if (!chatId || !assistantMessageId || !userMessageId) {
            return res.status(400).json({ error: "Missing parameters" });
        }

        const updatedChat = await Chat.findOneAndUpdate(
            { _id: chatId, userId },
            { $pull: { messages: { _id: { $in: [assistantMessageId, userMessageId] } } } },
            { new: true }
        );

        if (!updatedChat) {
            return res.status(404).json({ error: "Chat not found" });
        }

        return res.status(200).json({
            success: true,
            message: "Messages removed",
            chat: updatedChat
        });

    } catch (err) {
        return res.status(500).json({ error: "Internal server error" });
    }
};