const REQUIRED_ENVS = [
    "OPENAI_API_KEY",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY"
];

for (const key of REQUIRED_ENVS) {
    if (!process.env[key]) {
        throw new Error(`Missing required env var: ${key}`);
    }
}


import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

// =====================
// CONFIG
// =====================
const PORT = process.env.PORT || 3000;
const DISTANCE_THRESHOLD = 0.75;
const MAX_CHUNKS = 5;

// =====================
// Clients
// =====================
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// =====================
// Helpers
// =====================
function normalize(vec) {
    const norm = Math.sqrt(vec.reduce((sum, x) => sum + x * x, 0));
    return vec.map((x) => x / norm);
}

async function getFallbackAnswer(question) {
    const chatResponse = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.3,
        messages: [
            {
                role: 'system',
                content:
                    'You are a charming and helpful concierge for Bhils Kabeela Resort. ' +
                    'The user asked a question that is NOT in your knowledge base. ' +
                    'Politely and naturally admit you don\'t have that specific detail right now. ' +
                    'Offer to help with something else or suggest checking with the front desk if it\'s urgent. ' +
                    'Maintain a warm, conversational tone. Do not be robotic.'
            },
            {
                role: 'user',
                content: question,
            },
        ],
    });

    return {
        answer: chatResponse.choices[0].message.content,
        used_fallback: true,
    };
}

// =====================
// Core agent logic
// =====================
async function askAgent(question) {
    // 1️⃣ Embed question
    const embeddingResponse = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: question,
    });

    const queryEmbedding = normalize(
        embeddingResponse.data[0].embedding
    );

    // 2️⃣ Vector search
    const { data: matches, error } = await supabase.rpc(
        'match_knowledge_base',
        {
            query_embedding: queryEmbedding,
            match_threshold: 0.0,
            match_count: MAX_CHUNKS,
        }
    );

    if (error || !matches || matches.length === 0) {
        const fallback = await getFallbackAnswer(question);
        return { ...fallback, confidence: null };
    }

    const top = matches[0];

    // 3️⃣ Confidence gate
    if (top.distance > DISTANCE_THRESHOLD) {
        const fallback = await getFallbackAnswer(question);
        return {
            ...fallback,
            confidence: top.distance,
        };
    }

    // 4️⃣ Build context
    const context = matches
        .map((m) => `• ${m.content}`)
        .join('\n');

    // 5️⃣ ChatGPT answer
    const chatResponse = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.3, // Slightly higher for more natural flow
        messages: [
            {
                role: 'system',
                content:
                    'You are a warm, knowledgeable, and welcoming concierge for Bhils Kabeela Resort. ' +
                    'Your goal is to assist potential and current guests with a friendly, inviting tone. ' +
                    'Answer their questions naturally and conversationally using ONLY the provided context. ' +
                    'If the context contains the answer, rephrase it faithfully but comfortably—avoid stiff or robotic copying. ' +
                    'If the answer is NOT in the context, politely say you don\'t have that info on hand and suggest contacting the resort directly. ' +
                    'Do not mention "context provided" or "the data". Speak as a human staff member would.',
            },
            {
                role: 'user',
                content: `Context:\n${context}\n\nQuestion:\n${question}`,
            },
        ],
    });

    return {
        answer: chatResponse.choices[0].message.content,
        confidence: top.distance,
        used_fallback: false,
    };
}

// =====================
// Express App
// =====================
const app = express();
app.use(cors());
app.use(express.json());

// Health check
app.get('/', (_, res) => {
    res.json({ status: 'ok', service: 'Bhils Kabeela AI Agent' });
});

// Main API
app.post('/ask', async (req, res) => {
    const { question } = req.body;

    if (!question || typeof question !== 'string') {
        return res.status(400).json({
            error: 'Question is required',
        });
    }

    try {
        const result = await askAgent(question);
        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({
            error: 'Internal server error',
        });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 AI Agent API running on port ${PORT}`);
});
