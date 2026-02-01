import readline from 'readline';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

console.log('🤖 AI Agent Interactive Tester');
console.log('Make sure server is running on http://localhost:3000');
console.log('Type your questions below (or "exit" to quit)\n');

function askQuestion() {
    rl.question('💬 Your question: ', async (question) => {
        if (question.toLowerCase() === 'exit') {
            console.log('\n👋 Goodbye!');
            rl.close();
            return;
        }

        if (!question.trim()) {
            askQuestion();
            return;
        }

        try {
            const response = await fetch('http://localhost:3000/ask', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question })
            });

            const result = await response.json();

            console.log(`\n✅ Intent: ${result.intent}`);
            console.log(`💬 Answer: ${result.answer}`);
            if (result.confidence !== undefined && result.confidence !== null) {
                console.log(`📊 Confidence: ${result.confidence.toFixed(4)}`);
            }
            console.log(`🔄 Fallback: ${result.used_fallback}\n`);
        } catch (error) {
            console.log(`\n❌ Error: ${error.message}\n`);
        }

        askQuestion();
    });
}

askQuestion();
