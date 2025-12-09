// services/memoryService.js
import Memory from "../models/Memory.js";
import { createEmbedding } from "./embeddingService.js";
import logger from "../utils/logger.js";
// SAVE MEMORY
export async function saveMemory(userId, text, type = "general") {
    try {
        if (!userId || !text) {
            logger.error(" Missing userId or text in saveMemory()");
            return null;
        }

        // Generate embedding (MUST return array of numbers)
        const embedding = await createEmbedding(text);

        if (!Array.isArray(embedding) || embedding.length === 0) {
            logger.error(" Invalid embedding generated:", embedding);
            return null;
        }

        const memory = new Memory({
            userId,
            type,
            content: text,
            embedding, // pure vector array
        });

        await memory.save();

        logger.info(" Memory saved successfully");
        return memory;

    } catch (err) {
        logger.error(" Error saving memory:", err);
        return null;
    }
}

export async function searchMemory(userId, queryText, limit = 5) {
    try {
        if (!userId || !queryText) {
            logger.error(" Missing userId or queryText in searchMemory()");
            return [];
        }

        // Create embedding for the query
        const queryEmbedding = await createEmbedding(queryText);

        if (!Array.isArray(queryEmbedding) || queryEmbedding.length === 0) {
            logger.error(" Invalid query embedding:", queryEmbedding);
            return [];
        }
        const results = await Memory.aggregate([
            {
                $vectorSearch: {
                    index: "vector_index",
                    path: "embedding",
                    queryVector: queryEmbedding,
                    numCandidates: 100,
                    limit: limit
                }
            },
            {
                $limit: limit
            }
        ]);
        logger.info(`Memory search returned ${results.length} results`);
        return results;

    } catch (err) {
        logger.error("Error searching memory:", err);
        return [];
    }
}
