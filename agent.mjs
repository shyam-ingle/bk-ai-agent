import 'dotenv/config';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

// =====================
// CONFIG
// =====================
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

async function getFallbackAnswer(question) {
    const chatResponse = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.3,
        messages: [
            {
                role: 'system',
                content:
                    'You are a warm, knowledgeable concierge for Bhils Kabeela Resort. ' +
                    'The user asked a question that is NOT in your knowledge base. ' +
                    'Politely and naturally apologize that you don\'t have specific details on that PARTICULAR topic right now. ' +
                    'Suggest they contact the front desk for more information. ' +
                    'Do not make up any facts.'
            },
            {
                role: 'user',
                content: question,
            },
        ],
    });

    return chatResponse.choices[0].message.content;
}

// =====================
// Core ask function
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
    console.log('--- RAW MATCHES ---');
    console.log(matches);

    if (error || !matches || matches.length === 0) {
        return await getFallbackAnswer(question);
    }

    // 3️⃣ Confidence gate
    if (matches[0].distance > DISTANCE_THRESHOLD) {
        return await getFallbackAnswer(question);
    }

    // 4️⃣ Build context
    const context = matches
        .map((m) => `• ${m.content}`)
        .join('\n');

    // 5️⃣ ChatGPT grounded answer
    const chatResponse = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.3,
        messages: [
            {
                role: 'system',
                content:
                    'You are a warm, knowledgeable, and welcoming concierge for Bhils Kabeela Resort. ' +
                    'Your goal is to assist potential and current guests with a friendly, inviting tone. ' +
                    'Answer their questions naturally and conversationally using ONLY the provided context. ' +
                    'If the context contains the answer, rephrase it faithfully but comfortably—avoid stiff or robotic copying. ' +
                    'If the answer is NOT in the context, politely say you don\'t have that info on hand and suggest contacting the resort directly.',
            },
            {
                role: 'user',
                content: `Context:\n${context}\n\nQuestion:\n${question}`,
            },
        ],
    });

    return chatResponse.choices[0].message.content;
}

// =====================
// TEST
// =====================
const question = 'Is parking available at the property?';

const answer = await askAgent(question);
console.log('\n🤖 AI Response:\n');
console.log(answer);
