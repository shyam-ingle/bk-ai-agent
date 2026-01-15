import 'dotenv/config';
import fetch from 'node-fetch';
import { parse } from 'csv-parse/sync';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

// =====================
// CONFIG
// =====================
const CSV_URL =
    'https://docs.google.com/spreadsheets/d/e/2PACX-1vTJNLn_fEvnJLmf-2B5h3ShpSNa_LbcD0GF3a2Y_BOk-XxWIK3lmWpVGmcXHgZoriSL9k0oCNfF8MGU/pub?output=csv';

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

// =====================
// Fetch CSV
// =====================
console.log('📥 Fetching Google Sheet as CSV...');
const res = await fetch(CSV_URL);
const csvText = await res.text();

// =====================
// Parse CSV
// =====================
const rows = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
});

// =====================
// Embed + Store
// =====================
for (const row of rows) {
    const chunk_id = row.chunk_id?.trim();
    const category = row.category?.trim();
    const content = row.content?.trim();

    if (!chunk_id || !content) continue;

    // Skip if already exists
    const { data: existing } = await supabase
        .from('knowledge_base')
        .select('id')
        .eq('chunk_id', chunk_id)
        .maybeSingle();

    if (existing) {
        console.log(`⏭️  Skipping ${chunk_id}`);
        continue;
    }

    // Create embedding
    const embeddingResponse = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: content,
    });

    const raw = embeddingResponse.data[0].embedding;
    const norm = normalize(raw);

    // Insert
    const { error } = await supabase.from('knowledge_base').insert({
        chunk_id,
        category,
        content,
        embedding: raw,
        embedding_norm: norm,
    });

    if (error) {
        console.error(`❌ Failed for ${chunk_id}`, error.message);
    } else {
        console.log(`✅ Stored ${chunk_id}`);
    }
}

console.log('🎉 Embedding ingestion complete');
