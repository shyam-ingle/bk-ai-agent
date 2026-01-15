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

function fallback() {
    return (
        'I’m not seeing clear information about this right now. ' +
        'Let me check with the team and get back to you.'
    );
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
        return fallback();
    }

    // 3️⃣ Confidence gate
    if (matches[0].distance > DISTANCE_THRESHOLD) {
        return fallback();
    }

    // 4️⃣ Build context
    const context = matches
        .map((m) => `• ${m.content}`)
        .join('\n');

    // 5️⃣ ChatGPT grounded answer
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

    return chatResponse.choices[0].message.content;
}

// =====================
// TEST
// =====================
const question = 'Is parking available at the property?';

const answer = await askAgent(question);
console.log('\n🤖 AI Response:\n');
console.log(answer);
