import 'dotenv/config';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const question = 'Is the property pet friendly?';

// 1️⃣ Embed the question
const embeddingResponse = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: question,
});

const queryEmbedding = embeddingResponse.data[0].embedding;

// 2️⃣ Run similarity search (SQL via Supabase RPC)
const { data, error } = await supabase.rpc('match_knowledge_base', {
    query_embedding: queryEmbedding,
    match_threshold: 0.4,
    match_count: 5,
});

if (error) {
    console.error(error);
    process.exit(1);
}

// 3️⃣ Print retrieved chunks
console.log('\n🔎 Retrieved chunks:\n');

data.forEach((row, index) => {
    console.log(`Result ${index + 1}`);
    console.log('chunk_id:', row.chunk_id);
    console.log('category:', row.category);
    console.log('distance:', row.distance);
    console.log('content:', row.content);
    console.log('----------------------\n');
});
