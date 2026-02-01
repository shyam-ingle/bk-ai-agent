import OpenAI from "openai";

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

export async function classifyIntent(message) {
    const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0,
        messages: [
            {
                role: "system",
                content: `
You are a hotel front desk intent classifier for Bhils Kabeela Resort.

Classify the user's message into exactly ONE:
- GREETING
- CLARIFY
- FACTUAL_QUESTION
- OUT_OF_SCOPE

Rules:
- Do NOT answer the user
- Do NOT add facts
- Return ONLY valid JSON without markdown code blocks

Output format:
{
  "intent": "GREETING|CLARIFY|FACTUAL_QUESTION|OUT_OF_SCOPE",
  "clarifying_question": null
}
        `
            },
            { role: "user", content: message }
        ]
    });

    try {
        let content = completion.choices[0].message.content.trim();

        // Remove markdown code blocks if present
        content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '');

        const result = JSON.parse(content);

        // Validate intent
        const validIntents = ['GREETING', 'CLARIFY', 'FACTUAL_QUESTION', 'OUT_OF_SCOPE'];
        if (!validIntents.includes(result.intent)) {
            console.warn(`Invalid intent: ${result.intent}, defaulting to FACTUAL_QUESTION`);
            result.intent = 'FACTUAL_QUESTION';
        }

        return result;
    } catch (error) {
        console.error('Failed to parse intent:', error);
        console.error('Raw response:', completion.choices[0].message.content);
        // Fallback to factual question
        return {
            intent: 'FACTUAL_QUESTION',
            clarifying_question: null
        };
    }
}
