import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

function toArray(vec) {
    if (Array.isArray(vec)) return vec;
    if (typeof vec === 'string') return JSON.parse(vec);
    throw new Error('Unknown embedding format');
}

function normalize(vec) {
    const arr = toArray(vec);
    const norm = Math.sqrt(arr.reduce((sum, x) => sum + x * x, 0));
    return arr.map((x) => x / norm);
}

const { data: rows, error } = await supabase
    .from('knowledge_base')
    .select('id, embedding');

if (error) {
    console.error(error);
    process.exit(1);
}

for (const row of rows) {
    if (!row.embedding) continue;

    const embedding_norm = normalize(row.embedding);

    await supabase
        .from('knowledge_base')
        .update({ embedding_norm })
        .eq('id', row.id);

    console.log(`✅ Normalized ${row.id}`);
}

console.log('🎉 Backfill complete');
