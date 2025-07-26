#!/usr/bin/env node

/**
 * API Testing Utility for Idea-to-Specifications Backend
 * 
 * This script provides comprehensive testing for all API endpoints
 * Run with: node test-api.js
 */

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { io } from 'socket.io-client';

const API_BASE = 'http://localhost:3001/api';
const WEBSOCKET_URL = 'http://localhost:3001';
const TEST_TIMEOUT = 60000; // 60 seconds for longer tests

// Colors for console output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

class APITester {
  constructor() {
    this.results = {
      passed: 0,
      failed: 0,
      total: 0
    };
  }

  log(message, color = colors.reset) {
    console.log(`${color}${message}${colors.reset}`);
  }

  async makeRequest(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
    const config = {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    };

    if (config.body && typeof config.body === 'object') {
      config.body = JSON.stringify(config.body);
    }

    try {
      const response = await fetch(url, config);
      const data = await response.json().catch(() => response.text());
      
      return {
        status: response.status,
        data,
        headers: Object.fromEntries(response.headers.entries())
      };
    } catch (error) {
      throw new Error(`Request failed: ${error.message}`);
    }
  }

  async test(description, testFn) {
    this.results.total++;
    process.stdout.write(`${colors.blue}Testing: ${description}... ${colors.reset}`);

    try {
      await testFn();
      this.results.passed++;
      console.log(`${colors.green}✓ PASSED${colors.reset}`);
    } catch (error) {
      this.results.failed++;
      console.log(`${colors.red}✗ FAILED${colors.reset}`);
      console.log(`  ${colors.red}Error: ${error.message}${colors.reset}`);
    }
  }

  async runAllTests() {
    this.log(`${colors.bold}🧪 Starting API Tests for Idea-to-Specifications Backend${colors.reset}\n`);

    // Test 1: Health Check
    await this.test('Health check endpoint', async () => {
      const response = await this.makeRequest('/health');
      if (response.status !== 200) {
        throw new Error(`Expected status 200, got ${response.status}`);
      }
      if (response.data.status !== 'OK') {
        throw new Error(`Expected status OK, got ${response.data.status}`);
      }
    });

    // Test 2: API Documentation
    await this.test('API documentation endpoint', async () => {
      const response = await this.makeRequest('/docs');
      if (response.status !== 200) {
        throw new Error(`Expected status 200, got ${response.status}`);
      }
      if (!response.data.endpoints) {
        throw new Error('API documentation should include endpoints');
      }
    });

    // Test 3: Invalid endpoint (404)
    await this.test('404 handling for invalid endpoint', async () => {
      const response = await this.makeRequest('/invalid-endpoint');
      if (response.status !== 404) {
        throw new Error(`Expected status 404, got ${response.status}`);
      }
    });

    // Test 4: History endpoint with default parameters
    await this.test('History endpoint with defaults', async () => {
      const response = await this.makeRequest('/history');
      if (response.status !== 200) {
        throw new Error(`Expected status 200, got ${response.status}`);
      }
      if (!Array.isArray(response.data.data)) {
        throw new Error('History should return data array');
      }
      if (!response.data.pagination) {
        throw new Error('History should include pagination info');
      }
    });

    // Test 5: History endpoint with pagination
    await this.test('History endpoint with pagination', async () => {
      const response = await this.makeRequest('/history?page=1&limit=5');
      if (response.status !== 200) {
        throw new Error(`Expected status 200, got ${response.status}`);
      }
      if (response.data.pagination.limit !== 5) {
        throw new Error('Pagination limit not applied correctly');
      }
    });

    // Test 6: History endpoint with search
    await this.test('History endpoint with search', async () => {
      const response = await this.makeRequest('/history?search=test');
      if (response.status !== 200) {
        throw new Error(`Expected status 200, got ${response.status}`);
      }
      if (response.data.search !== 'test') {
        throw new Error('Search parameter not returned correctly');
      }
    });

    // Test 7: Generate endpoint validation (missing idea)
    await this.test('Generate endpoint validation - missing idea', async () => {
      const response = await this.makeRequest('/generate', {
        method: 'POST',
        body: {}
      });
      if (response.status !== 400) {
        throw new Error(`Expected status 400, got ${response.status}`);
      }
    });

    // Test 8: Generate endpoint validation (idea too short)
    await this.test('Generate endpoint validation - idea too short', async () => {
      const response = await this.makeRequest('/generate', {
        method: 'POST',
        body: { idea: 'short' }
      });
      if (response.status !== 400) {
        throw new Error(`Expected status 400, got ${response.status}`);
      }
    });

    // Test 9: Generate endpoint validation (idea too long)
    await this.test('Generate endpoint validation - idea too long', async () => {
      const response = await this.makeRequest('/generate', {
        method: 'POST',
        body: { idea: 'a'.repeat(5001) }
      });
      if (response.status !== 400) {
        throw new Error(`Expected status 400, got ${response.status}`);
      }
    });

    // Test 10: Spec endpoint with invalid ID
    await this.test('Spec endpoint with invalid ID', async () => {
      const response = await this.makeRequest('/spec/invalid');
      if (response.status !== 400) {
        throw new Error(`Expected status 400, got ${response.status}`);
      }
    });

    // Test 11: Spec endpoint with non-existent ID
    await this.test('Spec endpoint with non-existent ID', async () => {
      const response = await this.makeRequest('/spec/99999');
      if (response.status !== 404) {
        throw new Error(`Expected status 404, got ${response.status}`);
      }
    });

    // Test 12: Download endpoint with invalid ID
    await this.test('Download endpoint with invalid ID', async () => {
      const response = await this.makeRequest('/download/invalid');
      if (response.status !== 400) {
        throw new Error(`Expected status 400, got ${response.status}`);
      }
    });

    // Test 13: Delete endpoint with invalid ID
    await this.test('Delete endpoint with invalid ID', async () => {
      const response = await this.makeRequest('/history/invalid', {
        method: 'DELETE'
      });
      if (response.status !== 400) {
        throw new Error(`Expected status 400, got ${response.status}`);
      }
    });

    // Test 14: Gemini health check endpoint
    await this.test('Gemini CLI health check endpoint', async () => {
      const response = await this.makeRequest('/gemini/health');
      if (response.status !== 200 && response.status !== 503) {
        throw new Error(`Expected status 200 or 503, got ${response.status}`);
      }
      if (!response.data.service || response.data.service !== 'Gemini CLI') {
        throw new Error('Gemini health check should identify the service');
      }
    });

    // Test 15: WebSocket connection
    await this.test('WebSocket connection establishment', async () => {
      return new Promise((resolve, reject) => {
        const socket = io(WEBSOCKET_URL, {
          timeout: 5000,
          transports: ['websocket']
        });
        
        const timeout = setTimeout(() => {
          socket.disconnect();
          reject(new Error('WebSocket connection timeout'));
        }, 5000);
        
        socket.on('connect', () => {
          clearTimeout(timeout);
          socket.disconnect();
          resolve();
        });
        
        socket.on('connect_error', (error) => {
          clearTimeout(timeout);
          reject(new Error(`WebSocket connection failed: ${error.message}`));
        });
      });
    });

    // Test 16: Enhanced health check response
    await this.test('Enhanced health check with service details', async () => {
      const response = await this.makeRequest('/health');
      if (response.status !== 200) {
        throw new Error(`Expected status 200, got ${response.status}`);
      }
      if (!response.data.services) {
        throw new Error('Health check should include services status');
      }
      if (!response.data.statistics) {
        throw new Error('Health check should include statistics');
      }
      if (typeof response.data.uptime !== 'number') {
        throw new Error('Health check should include uptime');
      }
    });

    // Test 17: Rate limiting (if applicable)
    await this.test('Rate limiting protection', async () => {
      // This test might not work in development mode due to higher limits
      // But we can at least verify the endpoint responds correctly
      const response = await this.makeRequest('/generate', {
        method: 'POST',
        body: { idea: 'Test idea for rate limiting check that is long enough to pass validation' }
      });
      
      // Accept either success or rate limit error
      if (response.status !== 200 && response.status !== 429 && response.status !== 500) {
        throw new Error(`Expected status 200, 429, or 500, got ${response.status}`);
      }
    });

    this.printResults();
  }

  printResults() {
    this.log('\n' + '='.repeat(50));
    this.log(`${colors.bold}Test Results Summary${colors.reset}`);
    this.log('='.repeat(50));
    
    this.log(`Total Tests: ${this.results.total}`);
    this.log(`Passed: ${colors.green}${this.results.passed}${colors.reset}`);
    this.log(`Failed: ${colors.red}${this.results.failed}${colors.reset}`);
    
    const successRate = (this.results.passed / this.results.total * 100).toFixed(1);
    this.log(`Success Rate: ${successRate >= 90 ? colors.green : colors.yellow}${successRate}%${colors.reset}`);
    
    if (this.results.failed === 0) {
      this.log(`\n${colors.green}🎉 All tests passed! API is working correctly.${colors.reset}`);
    } else {
      this.log(`\n${colors.yellow}⚠️  Some tests failed. Please check the server logs and fix issues.${colors.reset}`);
    }
  }
}

// Enhanced Load testing scenarios
class LoadTester {
  constructor(baseUrl = API_BASE) {
    this.baseUrl = baseUrl;
  }

  async runLoadTest(concurrent = 5, requests = 20) {
    console.log(`\n${colors.bold}🚀 Running Load Test${colors.reset}`);
    console.log(`Concurrent requests: ${concurrent}`);
    console.log(`Total requests: ${requests}`);
    console.log('Target endpoint: GET /api/health\n');

    const startTime = Date.now();
    const results = { success: 0, failed: 0, times: [] };

    const makeRequest = async () => {
      const requestStart = Date.now();
      try {
        const response = await fetch(`${this.baseUrl}/health`);
        const requestTime = Date.now() - requestStart;
        results.times.push(requestTime);
        
        if (response.ok) {
          results.success++;
        } else {
          results.failed++;
        }
      } catch (error) {
        results.failed++;
      }
    };

    // Run requests in batches
    const batches = Math.ceil(requests / concurrent);
    for (let batch = 0; batch < batches; batch++) {
      const batchPromises = [];
      const batchSize = Math.min(concurrent, requests - batch * concurrent);
      
      for (let i = 0; i < batchSize; i++) {
        batchPromises.push(makeRequest());
      }
      
      await Promise.all(batchPromises);
      process.stdout.write('.');
    }

    const totalTime = Date.now() - startTime;
    const avgTime = results.times.reduce((a, b) => a + b, 0) / results.times.length;
    const minTime = Math.min(...results.times);
    const maxTime = Math.max(...results.times);

    console.log('\n\nLoad Test Results:');
    console.log(`Total time: ${totalTime}ms`);
    console.log(`Successful requests: ${colors.green}${results.success}${colors.reset}`);
    console.log(`Failed requests: ${colors.red}${results.failed}${colors.reset}`);
    console.log(`Average response time: ${avgTime.toFixed(2)}ms`);
    console.log(`Min response time: ${minTime}ms`);
    console.log(`Max response time: ${maxTime}ms`);
    console.log(`Requests per second: ${(requests / (totalTime / 1000)).toFixed(2)}`);
  }

  async runWebSocketLoadTest(concurrent = 3, connections = 10) {
    console.log(`\n${colors.bold}🔌 Running WebSocket Load Test${colors.reset}`);
    console.log(`Concurrent connections: ${concurrent}`);
    console.log(`Total connections: ${connections}\n`);

    const startTime = Date.now();
    const results = { connected: 0, failed: 0, times: [] };

    const createConnection = async () => {
      const connectionStart = Date.now();
      return new Promise((resolve) => {
        const socket = io(WEBSOCKET_URL, {
          timeout: 10000,
          transports: ['websocket']
        });
        
        const timeout = setTimeout(() => {
          socket.disconnect();
          results.failed++;
          resolve();
        }, 10000);
        
        socket.on('connect', () => {
          clearTimeout(timeout);
          const connectionTime = Date.now() - connectionStart;
          results.times.push(connectionTime);
          results.connected++;
          
          // Keep connection for a short time then disconnect
          setTimeout(() => {
            socket.disconnect();
            resolve();
          }, 1000);
        });
        
        socket.on('connect_error', () => {
          clearTimeout(timeout);
          results.failed++;
          resolve();
        });
      });
    };

    // Run connections in batches
    const batches = Math.ceil(connections / concurrent);
    for (let batch = 0; batch < batches; batch++) {
      const batchPromises = [];
      const batchSize = Math.min(concurrent, connections - batch * concurrent);
      
      for (let i = 0; i < batchSize; i++) {
        batchPromises.push(createConnection());
      }
      
      await Promise.all(batchPromises);
      process.stdout.write('.');
    }

    const totalTime = Date.now() - startTime;
    const avgTime = results.times.length > 0 
      ? results.times.reduce((a, b) => a + b, 0) / results.times.length 
      : 0;

    console.log('\n\nWebSocket Load Test Results:');
    console.log(`Total time: ${totalTime}ms`);
    console.log(`Successful connections: ${colors.green}${results.connected}${colors.reset}`);
    console.log(`Failed connections: ${colors.red}${results.failed}${colors.reset}`);
    if (avgTime > 0) {
      console.log(`Average connection time: ${avgTime.toFixed(2)}ms`);
      console.log(`Min connection time: ${Math.min(...results.times)}ms`);
      console.log(`Max connection time: ${Math.max(...results.times)}ms`);
    }
  }
}

// Integration test suite for end-to-end workflows
class IntegrationTester {
  constructor() {
    this.results = { passed: 0, failed: 0, total: 0 };
  }

  log(message, color = colors.reset) {
    console.log(`${color}${message}${colors.reset}`);
  }

  async test(description, testFn) {
    this.results.total++;
    process.stdout.write(`${colors.blue}Integration Test: ${description}... ${colors.reset}`);

    try {
      await testFn();
      this.results.passed++;
      console.log(`${colors.green}✓ PASSED${colors.reset}`);
    } catch (error) {
      this.results.failed++;
      console.log(`${colors.red}✗ FAILED${colors.reset}`);
      console.log(`  ${colors.red}Error: ${error.message}${colors.reset}`);
    }
  }

  async makeRequest(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
    const config = {
      method: 'GET',
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options
    };

    if (config.body && typeof config.body === 'object') {
      config.body = JSON.stringify(config.body);
    }

    const response = await fetch(url, config);
    const data = await response.json().catch(() => response.text());
    
    return { status: response.status, data };
  }

  async runIntegrationTests() {
    this.log(`\n${colors.bold}🔄 Running Integration Tests${colors.reset}\n`);

    // Integration Test 1: Full spec generation workflow with WebSocket
    await this.test('Complete spec generation workflow with WebSocket tracking', async () => {
      return new Promise(async (resolve, reject) => {
        let socket;
        const timeout = setTimeout(() => {
          if (socket) socket.disconnect();
          reject(new Error('Test timeout after 30 seconds'));
        }, 30000);

        try {
          // Step 1: Start generation
          const response = await this.makeRequest('/generate', {
            method: 'POST',
            body: { idea: 'Create a revolutionary mobile app for managing personal finances with AI-powered insights and automated savings recommendations' }
          });

          if (response.status !== 200) {
            throw new Error(`Generation start failed with status ${response.status}`);
          }

          const { jobId, id: recordId } = response.data;
          if (!jobId || !recordId) {
            throw new Error('Missing jobId or recordId in response');
          }

          // Step 2: Connect to WebSocket and track progress
          socket = io(WEBSOCKET_URL, { transports: ['websocket'] });
          let statusUpdates = [];

          socket.on('connect', () => {
            socket.emit('subscribe-job', jobId);
          });

          socket.on('job-update', (update) => {
            statusUpdates.push(update);
            
            if (update.status === 'completed') {
              // Step 3: Verify completion
              setTimeout(async () => {
                try {
                  const specResponse = await this.makeRequest(`/spec/${recordId}`);
                  if (specResponse.status !== 200) {
                    throw new Error('Failed to retrieve completed spec');
                  }
                  
                  if (!specResponse.data.generatedSpec || specResponse.data.status !== 'completed') {
                    throw new Error('Spec not properly completed');
                  }

                  clearTimeout(timeout);
                  socket.disconnect();
                  resolve();
                } catch (error) {
                  clearTimeout(timeout);
                  socket.disconnect();
                  reject(error);
                }
              }, 1000);
            } else if (update.status === 'failed') {
              clearTimeout(timeout);
              socket.disconnect();
              reject(new Error(`Job failed: ${update.error || 'Unknown error'}`));
            }
          });

          socket.on('connect_error', (error) => {
            clearTimeout(timeout);
            reject(new Error(`WebSocket connection failed: ${error.message}`));
          });

        } catch (error) {
          clearTimeout(timeout);
          if (socket) socket.disconnect();
          reject(error);
        }
      });
    });

    // Integration Test 2: Database performance under load
    await this.test('Database performance with multiple concurrent operations', async () => {
      const operations = [];
      const testData = 'Test idea for database performance testing with sufficient length to pass validation';
      
      // Create 5 concurrent operations
      for (let i = 0; i < 5; i++) {
        operations.push(
          this.makeRequest('/generate', {
            method: 'POST',
            body: { idea: `${testData} - Test ${i + 1}` }
          })
        );
      }

      const results = await Promise.all(operations);
      
      // Verify all operations started successfully
      for (const result of results) {
        if (result.status !== 200) {
          throw new Error(`Concurrent operation failed with status ${result.status}`);
        }
        if (!result.data.jobId) {
          throw new Error('Missing jobId in concurrent operation response');
        }
      }
    });

    // Integration Test 3: System recovery after multiple failures
    await this.test('System stability after error conditions', async () => {
      // Test various error conditions
      const errorTests = [
        { endpoint: '/spec/99999', expectedStatus: 404 },
        { endpoint: '/download/99999', expectedStatus: 404 },
        { endpoint: '/history/invalid', method: 'DELETE', expectedStatus: 400 },
        { endpoint: '/generate', method: 'POST', body: { idea: 'short' }, expectedStatus: 400 }
      ];

      for (const test of errorTests) {
        const response = await this.makeRequest(test.endpoint, {
          method: test.method || 'GET',
          body: test.body
        });
        
        if (response.status !== test.expectedStatus) {
          throw new Error(
            `Expected status ${test.expectedStatus} for ${test.endpoint}, got ${response.status}`
          );
        }
      }

      // Verify system is still healthy after errors
      const healthResponse = await this.makeRequest('/health');
      if (healthResponse.status !== 200) {
        throw new Error('System health degraded after error conditions');
      }
    });

    this.printResults();
  }

  printResults() {
    this.log('\n' + '='.repeat(60));
    this.log(`${colors.bold}Integration Test Results Summary${colors.reset}`);
    this.log('='.repeat(60));
    
    this.log(`Total Tests: ${this.results.total}`);
    this.log(`Passed: ${colors.green}${this.results.passed}${colors.reset}`);
    this.log(`Failed: ${colors.red}${this.results.failed}${colors.reset}`);
    
    const successRate = (this.results.passed / this.results.total * 100).toFixed(1);
    this.log(`Success Rate: ${successRate >= 90 ? colors.green : colors.yellow}${successRate}%${colors.reset}`);
    
    if (this.results.failed === 0) {
      this.log(`\n${colors.green}🎉 All integration tests passed! System is working correctly.${colors.reset}`);
    } else {
      this.log(`\n${colors.yellow}⚠️  Some integration tests failed. Please check system integration.${colors.reset}`);
    }
  }
}

// Usage examples
function printUsageExamples() {
  console.log(`\n${colors.bold}📚 API Usage Examples${colors.reset}`);
  console.log('='.repeat(50));

  const examples = [
    {
      title: 'Generate Specification',
      method: 'POST',
      endpoint: '/api/generate',
      body: {
        idea: "Create a mobile app for tracking daily water intake with reminders and progress visualization"
      },
      description: 'Generates a product specification from your idea using Gemini CLI'
    },
    {
      title: 'Get History (Paginated)',
      method: 'GET',
      endpoint: '/api/history?page=1&limit=10',
      description: 'Retrieves paginated list of previous generations'
    },
    {
      title: 'Search History',
      method: 'GET',
      endpoint: '/api/history?search=mobile app',
      description: 'Searches through history for specific terms'
    },
    {
      title: 'Get Specific Specification',
      method: 'GET',
      endpoint: '/api/spec/123',
      description: 'Retrieves full details of a specific specification'
    },
    {
      title: 'Download as Markdown',
      method: 'GET',
      endpoint: '/api/download/123',
      description: 'Downloads specification as formatted Markdown file'
    },
    {
      title: 'Delete Entry',
      method: 'DELETE',
      endpoint: '/api/history/123',
      description: 'Deletes a specific history entry'
    },
    {
      title: 'Health Check',
      method: 'GET',
      endpoint: '/api/health',
      description: 'Checks API health and service availability'
    }
  ];

  examples.forEach(example => {
    console.log(`\n${colors.blue}${example.title}${colors.reset}`);
    console.log(`${example.method} ${example.endpoint}`);
    if (example.body) {
      console.log(`Body: ${JSON.stringify(example.body, null, 2)}`);
    }
    console.log(`Description: ${example.description}`);
  });

  console.log(`\n${colors.yellow}🔧 cURL Examples:${colors.reset}`);
  console.log(`
# Generate specification
curl -X POST ${API_BASE}/generate \\
  -H "Content-Type: application/json" \\
  -d '{"idea": "Your brilliant idea here (at least 10 characters)"}'

# Get paginated history
curl "${API_BASE}/history?page=1&limit=5"

# Search history
curl "${API_BASE}/history?search=mobile"

# Health check
curl "${API_BASE}/health"

# Download specification (replace 123 with actual ID)
curl "${API_BASE}/download/123" -o specification.md
  `);
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: node test-api.js [options]

Options:
  --help, -h        Show this help message
  --examples        Show API usage examples only
  --load            Run load testing (5 concurrent, 20 requests + WebSocket test)
  --load=N,M        Run load testing (N concurrent, M requests + WebSocket test)
  --integration     Run comprehensive integration tests
  --verbose         Run tests with detailed output

Default: Run functional API tests
    `);
    return;
  }

  if (args.includes('--examples')) {
    printUsageExamples();
    return;
  }

  if (args.some(arg => arg.startsWith('--load'))) {
    let concurrent = 5, requests = 20;
    const loadArg = args.find(arg => arg.startsWith('--load'));
    if (loadArg.includes('=')) {
      const [c, r] = loadArg.split('=')[1].split(',').map(Number);
      concurrent = c || concurrent;
      requests = r || requests;
    }
    
    const loadTester = new LoadTester();
    await loadTester.runLoadTest(concurrent, requests);
    
    // Also run WebSocket load test
    await loadTester.runWebSocketLoadTest(Math.max(2, Math.floor(concurrent / 2)), Math.max(5, Math.floor(requests / 2)));
    return;
  }

  if (args.includes('--integration')) {
    const integrationTester = new IntegrationTester();
    await integrationTester.runIntegrationTests();
    return;
  }

  // Run functional tests
  const tester = new APITester();
  await tester.runAllTests();
  
  if (args.includes('--verbose')) {
    printUsageExamples();
  }
}

// Check if server is running before testing
async function checkServer() {
  try {
    await fetch(`${API_BASE}/health`);
    return true;
  } catch (error) {
    console.log(`${colors.red}❌ Server is not running on ${API_BASE}${colors.reset}`);
    console.log(`${colors.yellow}Please start the server first with: npm run dev${colors.reset}\n`);
    return false;
  }
}

// Run tests if server is available
checkServer().then(isRunning => {
  if (isRunning) {
    main().catch(error => {
      console.error(`${colors.red}Test execution failed: ${error.message}${colors.reset}`);
      process.exit(1);
    });
  } else {
    process.exit(1);
  }
});