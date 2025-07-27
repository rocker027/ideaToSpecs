import { spawn } from 'child_process';

// Test Gemini CLI directly
async function testGeminiCLI(idea) {
  return new Promise((resolve, reject) => {
    console.log('Testing Gemini CLI with idea:', idea);
    
    const prompt = `Please create a comprehensive product specification document for the following idea: "${idea}".

Include the following sections:
1. **Project Overview** - Brief description and goals
2. **Core Features** - Main functionality and capabilities  
3. **Technical Requirements** - Technology stack and architecture
4. **User Interface Design** - UI/UX considerations
5. **Development Roadmap** - Implementation phases and timeline
6. **Success Metrics** - KPIs and measurement criteria

Format the output in clean Markdown with proper headers, bullet points, and code blocks where appropriate. Use emojis to make it visually appealing.`;

    const geminiProcess = spawn('gemini', ['-p', prompt], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let output = '';
    let error = '';

    geminiProcess.stdout.on('data', (data) => {
      output += data.toString();
    });

    geminiProcess.stderr.on('data', (data) => {
      error += data.toString();
    });

    geminiProcess.on('close', (code) => {
      console.log('Gemini CLI exit code:', code);
      if (code === 0 && output.trim()) {
        console.log('✅ Gemini CLI succeeded');
        console.log('Output length:', output.length);
        console.log('First 200 chars:', output.substring(0, 200));
        resolve({
          output: output.trim(),
          duration: 1000,
          attempt: 1,
          outputLength: output.length
        });
      } else {
        console.log('❌ Gemini CLI failed');
        console.log('Error output:', error);
        reject(new Error(`Gemini CLI failed with code ${code}: ${error || 'No output generated'}`));
      }
    });

    geminiProcess.on('error', (err) => {
      console.log('❌ Gemini CLI process error:', err);
      reject(err);
    });
  });
}

// Test with sample idea
testGeminiCLI('製作一個todo list')
  .then(result => {
    console.log('🎉 Test successful!');
    console.log('Result:', {
      outputLength: result.outputLength,
      duration: result.duration
    });
  })
  .catch(error => {
    console.log('💥 Test failed:', error.message);
  });