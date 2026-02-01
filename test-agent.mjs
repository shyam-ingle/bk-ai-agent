// Test script for the AI agent
// Make sure server.mjs is running first: node server.mjs

const testQuestions = [
    { type: 'GREETING', question: 'Hello!' },
    { type: 'GREETING', question: 'Hi there' },
    { type: 'FACTUAL', question: 'Is there a swimming pool?' },
    { type: 'FACTUAL', question: 'What are the check-in times?' },
    { type: 'FACTUAL', question: 'Do you have a restaurant?' },
    { type: 'OUT_OF_SCOPE', question: 'What is the weather in Paris?' },
    { type: 'OUT_OF_SCOPE', question: 'Can you book me a flight?' },
    { type: 'CLARIFY', question: 'Tell me about amenities' },
];

async function testAgent() {
    console.log('🧪 Testing AI Agent...\n');
    console.log('Make sure server is running on http://localhost:3000\n');
    console.log('='.repeat(80) + '\n');

    for (const test of testQuestions) {
        console.log(`📝 Question (Expected: ${test.type}):`);
        console.log(`   "${test.question}"\n`);

        try {
            const response = await fetch('http://localhost:3000/ask', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question: test.question })
            });

            const result = await response.json();

            console.log(`✅ Intent: ${result.intent}`);
            console.log(`💬 Answer: ${result.answer}`);
            if (result.confidence !== undefined) {
                console.log(`📊 Confidence: ${result.confidence}`);
            }
            console.log(`🔄 Used Fallback: ${result.used_fallback}`);
        } catch (error) {
            console.log(`❌ Error: ${error.message}`);
        }

        console.log('\n' + '='.repeat(80) + '\n');

        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log('✨ Testing complete!');
}

testAgent();
