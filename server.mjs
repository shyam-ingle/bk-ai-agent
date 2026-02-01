import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import { classifyIntent } from './intent-classifier.mjs';

// =====================
// ENV GUARD
// =====================
const REQUIRED_ENVS = [
    'OPENAI_API_KEY',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY'
];

for (const key of REQUIRED_ENVS) {
    if (!process.env[key]) {
        throw new Error(`Missing required env var: ${key}`);
    }
}

// =====================
// CONFIG
// =====================
const PORT = process.env.PORT || 3000;
const DISTANCE_THRESHOLD = 0.55; // important: keep conservative
const MAX_CHUNKS = 5;

// =====================
// CLIENTS
// =====================
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// =====================
// HELPERS
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
                    'You are a warm and polite concierge for Bhils Kabeela Resort. ' +
                    'You do NOT have the information required to answer the user’s question accurately. ' +
                    'Clearly and naturally say you do not have this detail right now. ' +
                    'Suggest contacting the resort team or WhatsApp for accurate assistance. ' +
                    'Do NOT ask follow-up questions.'
            },
            {
                role: 'user',
                content: question
            }
        ]
    });

    return {
        answer: chatResponse.choices[0].message.content,
        used_fallback: true
    };
}

// =====================
// CORE RAG LOGIC
// =====================
async function askAgent(question) {
    // 1️⃣ Embed question
    const embeddingResponse = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: question
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
            match_count: MAX_CHUNKS
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
            confidence: top.distance
        };
    }

    // 4️⃣ Build context
    const context = matches
        .map((m) => `• ${m.content}`)
        .join('\n');

    // 5️⃣ Answer using context only
    const chatResponse = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.3,
        messages: [
            {
                role: 'system',
                content:
                    'You are a warm, knowledgeable front desk concierge for Bhils Kabeela Resort. ' +
                    'Answer naturally using ONLY the provided context. ' +
                    'If the answer is not present, clearly say you do not have that information and suggest contacting the resort. ' +
                    'Do not mention context, documents, or internal systems.'
            },
            {
                role: 'user',
                content: `Context:\n${context}\n\nQuestion:\n${question}`
            }
        ]
    });

    return {
        answer: chatResponse.choices[0].message.content,
        confidence: top.distance,
        used_fallback: false
    };
}

// =====================
// EXPRESS APP
// =====================
const app = express();
app.use(cors());
app.use(express.json());

// Health check
app.get('/', (_, res) => {
    res.json({ status: 'ok', service: 'Bhils Kabeela AI Agent' });
});

// =====================
// MAIN API
// =====================
app.post('/ask', async (req, res) => {
    const { question } = req.body;

    if (!question || typeof question !== 'string') {
        return res.status(400).json({ error: 'Question is required' });
    }

    try {
        // 1️⃣ Intent classification
        const { intent, clarifying_question } = await classifyIntent(question);

        // 2️⃣ GREETING
        if (intent === 'GREETING') {
            return res.json({
                answer:
                    'Hello 👋 Welcome to Bhils Kabeela! I can help you with rooms, safari, location, food, or your stay. What would you like to know?',
                intent: 'GREETING',
                confidence: null,
                used_fallback: false
            });
        }

        // 3️⃣ CLARIFY
        if (intent === 'CLARIFY') {
            return res.json({
                answer:
                    clarifying_question ||
                    'Sure 😊 Could you please share a bit more about what you’d like to know?',
                intent: 'CLARIFY',
                confidence: null,
                used_fallback: false
            });
        }

        // 4️⃣ OUT OF SCOPE → escalate
        if (intent === 'OUT_OF_SCOPE') {
            return res.json({
                answer:
                    'I want to make sure you get the right information. Our team would be happy to assist you directly 😊',
                intent: 'OUT_OF_SCOPE',
                confidence: null,
                used_fallback: true
            });
        }

        // 5️⃣ FACTUAL QUESTION → RAG
        const result = await askAgent(question);
        return res.json({ ...result, intent: 'FACTUAL_QUESTION' });

    } catch (err) {
        console.error(err);
        return res.status(500).json({
            error: 'Internal server error'
        });
    }
});

// =====================
// START SERVER
// =====================
app.listen(PORT, () => {
    console.log(`🚀 Bhils Kabeela AI Agent running on port ${PORT}`);
});
