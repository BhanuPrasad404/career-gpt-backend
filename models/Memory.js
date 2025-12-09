import mongoose from "mongoose";

const MemorySchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, required: true }, // "profile", "roadmap", etc.
    content: { type: String, required: true },
    embedding: { type: [Number], required: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

MemorySchema.index({ userId: 1, type: 1 });

export default mongoose.model("Memory", MemorySchema);
