import { spawn } from 'child_process';

async function testGeminiDirect() {
  console.log('Testing Gemini CLI directly...');
  
  const prompt = '開發一個簡單的待辦清單應用程式的規格概要，用繁體中文回答，50字以內';
  
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    
    const geminiProcess = spawn('gemini', ['-p', prompt], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let output = '';
    let error = '';
    let isCompleted = false;

    // Set up timeout - shorter for testing
    const timeoutId = setTimeout(() => {
      if (\!isCompleted) {
        isCompleted = true;
        geminiProcess.kill('SIGTERM');
        reject(new Error(`Gemini CLI timeout after 30000ms`));
      }
    }, 30000);

    geminiProcess.stdout.on('data', (data) => {
      output += data.toString();
      console.log('Received data chunk:', data.toString().substring(0, 100) + '...');
    });

    geminiProcess.stderr.on('data', (data) => {
      error += data.toString();
      console.log('Received error:', data.toString());
    });

    geminiProcess.on('close', (code) => {
      if (\!isCompleted) {
        isCompleted = true;
        clearTimeout(timeoutId);
        const duration = Date.now() - startTime;
        
        console.log(`Process closed with code: ${code}, duration: ${duration}ms`);
        console.log(`Output length: ${output.length}`);
        console.log(`Error length: ${error.length}`);
        
        if (code === 0) {
          resolve({
            output: output.trim(),
            duration,
            outputLength: output.length
          });
        } else {
          reject(new Error(`Gemini CLI failed with code ${code}: ${error}`));
        }
      }
    });

    geminiProcess.on('error', (err) => {
      if (\!isCompleted) {
        isCompleted = true;
        clearTimeout(timeoutId);
        reject(new Error(`Failed to start Gemini CLI: ${err.message}`));
      }
    });
  });
}

// Run the test
testGeminiDirect()
  .then(result => {
    console.log('✅ Test successful\!');
    console.log('Output:', result.output);
    console.log('Duration:', result.duration + 'ms');
  })
  .catch(error => {
    console.error('❌ Test failed:', error.message);
  });
EOF < /dev/null