// services/embeddingService.js
import dotenv from "dotenv";
import logger from "../utils/logger.js";

dotenv.config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

export async function createEmbedding(text) {
    logger.info("🔵 Google Embedding Service - START");

    const apiUrl =
        `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${GEMINI_API_KEY}`;

    logger.info("Sending embedding request to Google...");

    const response = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            content: {
                parts: [{ text }]
            }
        }),
    });

    logger.info(` Google API response status: ${response.status}`);


    const body = await response.text();

    if (!response.ok) {
        logger.error(" Google embedding API error:", {
            status: response.status,
            errorBody: body
        });
        return [];
    }

    const json = JSON.parse(body);

    return json.embedding.values;
}

