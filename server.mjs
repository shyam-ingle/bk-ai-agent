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
const DISTANCE_THRESHOLD = 0.55;
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

function fallback() {
    return {
        answer:
            'I’m not seeing clear information about this right now. Let me check with the team and get back to you.',
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
            match_threshold: 10,
            match_count: MAX_CHUNKS,
        }
    );

    if (error || !matches || matches.length === 0) {
        return { ...fallback(), confidence: null };
    }

    const top = matches[0];

    // 3️⃣ Confidence gate
    if (top.distance > DISTANCE_THRESHOLD) {
        return {
            ...fallback(),
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
        temperature: 0.2,
        messages: [
            {
                role: 'system',
                content:
                    'You are a helpful AI assistant for Bhils Kabeela resort. ' +
                    'Answer ONLY using the provided context. ' +
                    'If the answer is not present, say you are unsure.',
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
