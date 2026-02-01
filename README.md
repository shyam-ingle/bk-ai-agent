Bhils Kabeela – AI Support Agent (RAG)

This project implements a Retrieval-Augmented Generation (RAG)–based AI support agent for Bhils Kabeela, a luxury resort.
The agent answers guest questions using resort-specific knowledge, with strong safeguards against hallucinations.

✨ Features

✅ Resort-specific answers grounded in a curated knowledge base

✅ Semantic search using vector embeddings (cosine similarity)

✅ Confidence-based fallback (no hallucinations)

✅ Cost-efficient (ChatGPT only used when confident)

✅ Designed to scale across Website, WhatsApp, and other channels

🧠 Architecture Overview :User Question
   ↓
OpenAI Embedding (query)
   ↓
Supabase Vector Search (cosine similarity)
   ↓
Confidence Gate (distance threshold)
   ↓
ChatGPT (only if confident)
   ↓
Final Answer OR Safe Fallback

🗂 Knowledge Base Structure

The knowledge base is maintained in Google Sheets and ingested into Supabase.

Each chunk contains:

Field	Description
chunk_id	Unique identifier for the chunk
category	Logical grouping (Rooms, Policies, Facilities, etc.)
content	The actual knowledge text
embedding	Raw OpenAI embedding
embedding_norm	Unit-normalized embedding (used for cosine similarity)


🧮 Why Normalized Embeddings?

Cosine similarity works correctly only when vectors are unit-normalized.

To ensure mathematical correctness and future stability:

Raw embeddings are preserved

Normalized embeddings are stored separately

All similarity search uses embedding_norm

🛡 Hallucination Prevention

The agent uses distance-based confidence gating:

If top cosine distance ≤ threshold → answer using ChatGPT

If distance > threshold → return a safe fallback message

This ensures:

No guessing

No fabricated policies

Human-like uncertainty when information is unclear

📁 Key Files
embed.mjs

Fetches knowledge base (CSV)

Generates embeddings

Normalizes embeddings

Stores data in Supabase

Idempotent (skips existing chunks)

agent.mjs

Accepts a user question

Embeds and normalizes the query

Runs semantic search via Supabase

Applies confidence gating

Generates a grounded response via ChatGPT

Supabase SQL Function

Performs cosine similarity search

Uses normalized embeddings only

Reusable across all clients

⚙️ Tech Stack

Node.js

OpenAI API

text-embedding-3-small

gpt-4o-mini

Supabase

PostgreSQL

pgvector

Google Sheets (content management)

💰 Cost Considerations

Every query incurs a small embedding cost

ChatGPT is called only when confidence is high

Typical cost per answered question is fractions of a cent

Safe for small-to-medium traffic volumes (hotels, resorts)

🚀 Deployment Plan

Planned touchpoints:

Website chat widget

WhatsApp Cloud API

Internal staff dashboard (optional)

The same agent logic will be reused across all channels.

---

## 📝 How to Expand the Knowledge Base

1.  **Create your own Google Sheet**
    *   Create a new Google Sheet (or copy the existing structure).
    *   Ensure it has these columns: `chunk_id`, `category`, `content`.

2.  **Publish to Web**
    *   Go to **File > Share > Publish to web**.
    *   Select **"Entire Document"** and **"Comma-separated values (.csv)"**.
    *   Click **Publish** and copy the generated link.

3.  **Update Config**
    *   Open `embed.mjs`.
    *   Replace the `CSV_URL` variable with your new link.

4.  **Ingest Data**
    *   Run the command:
        ```bash
        node embed.mjs
        ```
    *   The script will **Upsert** the data:
        *   **New IDs** will be created.
        *   **Existing IDs** with *changed content* will be updated.
        *   **Unchanged content** will be skipped (saving costs).


# agent.mjs contains only RAG whereas agent.ms contain intent classifer + RAG. Server.mjs has api end points, ready for production