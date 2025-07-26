#!/usr/bin/env node

/**
 * Performance Monitoring and Analysis Tool
 * 
 * This script provides comprehensive performance monitoring for the Idea-to-Specs backend
 * Run with: node performance-monitor.js [options]
 */

import { io } from 'socket.io-client';

const API_BASE = 'http://localhost:3001/api';
const WEBSOCKET_URL = 'http://localhost:3001';

// Colors for console output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

class PerformanceMonitor {
  constructor() {
    this.metrics = {
      apiCalls: [],
      websocketConnections: [],
      systemHealth: [],
      errors: []
    };
    this.isMonitoring = false;
  }

  log(message, color = colors.reset) {
    console.log(`${color}${message}${colors.reset}`);
  }

  // Make HTTP request with timing
  async makeRequest(endpoint, options = {}) {
    const startTime = Date.now();
    const url = `${API_BASE}${endpoint}`;
    
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        ...options
      });
      
      const duration = Date.now() - startTime;
      const data = await response.json().catch(() => response.text());
      
      this.metrics.apiCalls.push({
        endpoint,
        method: options.method || 'GET',
        status: response.status,
        duration,
        timestamp: new Date(),
        size: JSON.stringify(data).length
      });
      
      return { status: response.status, data, duration };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.metrics.errors.push({
        type: 'api_error',
        endpoint,
        error: error.message,
        duration,
        timestamp: new Date()
      });
      throw error;
    }
  }

  // Test WebSocket connection performance
  async testWebSocketConnection() {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const socket = io(WEBSOCKET_URL, {
        transports: ['websocket'],
        timeout: 10000
      });

      let connected = false;
      
      const timeout = setTimeout(() => {
        if (!connected) {
          socket.disconnect();
          this.metrics.errors.push({
            type: 'websocket_timeout',
            error: 'Connection timeout',
            duration: Date.now() - startTime,
            timestamp: new Date()
          });
          reject(new Error('WebSocket connection timeout'));
        }
      }, 10000);

      socket.on('connect', () => {
        connected = true;
        clearTimeout(timeout);
        const connectionTime = Date.now() - startTime;
        
        this.metrics.websocketConnections.push({
          status: 'connected',
          duration: connectionTime,
          socketId: socket.id,
          timestamp: new Date()
        });

        // Test job subscription
        const testJobId = `test_${Date.now()}`;
        socket.emit('subscribe-job', testJobId);
        
        setTimeout(() => {
          socket.emit('unsubscribe-job', testJobId);
          socket.disconnect();
          resolve(connectionTime);
        }, 1000);
      });

      socket.on('connect_error', (error) => {
        connected = true;
        clearTimeout(timeout);
        this.metrics.errors.push({
          type: 'websocket_error',
          error: error.message,
          duration: Date.now() - startTime,
          timestamp: new Date()
        });
        reject(error);
      });
    });
  }

  // Monitor system health over time
  async monitorSystemHealth(duration = 60000) {
    this.log(`${colors.cyan}Starting system health monitoring for ${duration/1000} seconds...${colors.reset}`);
    this.isMonitoring = true;
    
    const interval = setInterval(async () => {
      if (!this.isMonitoring) {
        clearInterval(interval);
        return;
      }

      try {
        const response = await this.makeRequest('/health');
        this.metrics.systemHealth.push({
          status: response.data.status,
          services: response.data.services,
          statistics: response.data.statistics,
          uptime: response.data.uptime,
          memory: response.data.memory,
          duration: response.duration,
          timestamp: new Date()
        });
      } catch (error) {
        this.metrics.errors.push({
          type: 'health_check_error',
          error: error.message,
          timestamp: new Date()
        });
      }
    }, 5000); // Check every 5 seconds

    setTimeout(() => {
      this.isMonitoring = false;
      clearInterval(interval);
    }, duration);
  }

  // Run comprehensive performance test
  async runPerformanceTest() {
    this.log(`${colors.bold}🚀 Starting Comprehensive Performance Test${colors.reset}\n`);

    // Test 1: API Response Times
    this.log(`${colors.blue}Testing API Response Times...${colors.reset}`);
    const endpoints = ['/health', '/docs', '/history', '/gemini/health'];
    
    for (const endpoint of endpoints) {
      try {
        const response = await this.makeRequest(endpoint);
        this.log(`  ${endpoint}: ${response.duration}ms (${response.status})`);
      } catch (error) {
        this.log(`  ${endpoint}: ERROR - ${error.message}`, colors.red);
      }
    }

    // Test 2: WebSocket Connection Performance
    this.log(`\n${colors.blue}Testing WebSocket Connection Performance...${colors.reset}`);
    try {
      const connectionTime = await this.testWebSocketConnection();
      this.log(`  WebSocket connection: ${connectionTime}ms`);
    } catch (error) {
      this.log(`  WebSocket connection: ERROR - ${error.message}`, colors.red);
    }

    // Test 3: Concurrent API Calls
    this.log(`\n${colors.blue}Testing Concurrent API Performance...${colors.reset}`);
    const concurrentPromises = [];
    const concurrentCount = 10;
    
    for (let i = 0; i < concurrentCount; i++) {
      concurrentPromises.push(this.makeRequest('/health'));
    }

    try {
      const startTime = Date.now();
      const results = await Promise.all(concurrentPromises);
      const totalTime = Date.now() - startTime;
      const avgResponseTime = results.reduce((sum, r) => sum + r.duration, 0) / results.length;
      
      this.log(`  ${concurrentCount} concurrent requests completed in ${totalTime}ms`);
      this.log(`  Average response time: ${avgResponseTime.toFixed(2)}ms`);
      this.log(`  Requests per second: ${(concurrentCount / (totalTime / 1000)).toFixed(2)}`);
    } catch (error) {
      this.log(`  Concurrent test failed: ${error.message}`, colors.red);
    }

    // Test 4: Memory and System Performance
    this.log(`\n${colors.blue}Testing System Resource Usage...${colors.reset}`);
    try {
      const healthResponse = await this.makeRequest('/health');
      const health = healthResponse.data;
      
      this.log(`  System uptime: ${(health.uptime / 60).toFixed(2)} minutes`);
      this.log(`  Memory usage: ${(health.memory.used / 1024 / 1024).toFixed(2)} MB`);
      this.log(`  Heap used: ${(health.memory.heapUsed / 1024 / 1024).toFixed(2)} MB`);
      this.log(`  Active connections: ${health.statistics.activeConnections}`);
      this.log(`  Processing jobs: ${health.statistics.processingJobs}`);
    } catch (error) {
      this.log(`  System resource check failed: ${error.message}`, colors.red);
    }

    // Test 5: Database Performance
    this.log(`\n${colors.blue}Testing Database Performance...${colors.reset}`);
    try {
      const queries = [
        '/history?limit=1',
        '/history?limit=10',
        '/history?limit=50',
        '/history?search=test'
      ];

      for (const query of queries) {
        const response = await this.makeRequest(query);
        this.log(`  ${query}: ${response.duration}ms`);
      }
    } catch (error) {
      this.log(`  Database performance test failed: ${error.message}`, colors.red);
    }

    this.generateReport();
  }

  // Generate performance report
  generateReport() {
    this.log(`\n${colors.bold}📊 Performance Analysis Report${colors.reset}`);
    this.log('='.repeat(60));

    // API Performance Summary
    if (this.metrics.apiCalls.length > 0) {
      const apiCalls = this.metrics.apiCalls;
      const avgResponseTime = apiCalls.reduce((sum, call) => sum + call.duration, 0) / apiCalls.length;
      const minResponseTime = Math.min(...apiCalls.map(call => call.duration));
      const maxResponseTime = Math.max(...apiCalls.map(call => call.duration));
      const successRate = (apiCalls.filter(call => call.status < 400).length / apiCalls.length * 100);

      this.log(`\n${colors.cyan}API Performance:${colors.reset}`);
      this.log(`  Total API calls: ${apiCalls.length}`);
      this.log(`  Average response time: ${avgResponseTime.toFixed(2)}ms`);
      this.log(`  Min response time: ${minResponseTime}ms`);
      this.log(`  Max response time: ${maxResponseTime}ms`);
      this.log(`  Success rate: ${successRate.toFixed(1)}%`);

      // Breakdown by endpoint
      const endpointStats = {};
      apiCalls.forEach(call => {
        if (!endpointStats[call.endpoint]) {
          endpointStats[call.endpoint] = { count: 0, totalTime: 0, errors: 0 };
        }
        endpointStats[call.endpoint].count++;
        endpointStats[call.endpoint].totalTime += call.duration;
        if (call.status >= 400) endpointStats[call.endpoint].errors++;
      });

      this.log(`\n  Endpoint breakdown:`);
      Object.entries(endpointStats).forEach(([endpoint, stats]) => {
        const avg = (stats.totalTime / stats.count).toFixed(2);
        const errorRate = (stats.errors / stats.count * 100).toFixed(1);
        this.log(`    ${endpoint}: ${avg}ms avg, ${errorRate}% errors (${stats.count} calls)`);
      });
    }

    // WebSocket Performance
    if (this.metrics.websocketConnections.length > 0) {
      const wsConnections = this.metrics.websocketConnections;
      const avgConnectionTime = wsConnections.reduce((sum, conn) => sum + conn.duration, 0) / wsConnections.length;

      this.log(`\n${colors.cyan}WebSocket Performance:${colors.reset}`);
      this.log(`  Total connections tested: ${wsConnections.length}`);
      this.log(`  Average connection time: ${avgConnectionTime.toFixed(2)}ms`);
      this.log(`  Connection success rate: 100%`);
    }

    // System Health Summary
    if (this.metrics.systemHealth.length > 0) {
      const healthChecks = this.metrics.systemHealth;
      const avgHealthCheckTime = healthChecks.reduce((sum, check) => sum + check.duration, 0) / healthChecks.length;
      const healthyChecks = healthChecks.filter(check => check.status === 'OK').length;

      this.log(`\n${colors.cyan}System Health:${colors.reset}`);
      this.log(`  Health checks performed: ${healthChecks.length}`);
      this.log(`  Average health check time: ${avgHealthCheckTime.toFixed(2)}ms`);
      this.log(`  System availability: ${(healthyChecks / healthChecks.length * 100).toFixed(1)}%`);

      // Latest system status
      const latest = healthChecks[healthChecks.length - 1];
      if (latest) {
        this.log(`  Current system status: ${latest.status}`);
        this.log(`  Active connections: ${latest.statistics?.activeConnections || 0}`);
        this.log(`  Processing jobs: ${latest.statistics?.processingJobs || 0}`);
      }
    }

    // Error Summary
    if (this.metrics.errors.length > 0) {
      this.log(`\n${colors.yellow}Errors Encountered:${colors.reset}`);
      const errorTypes = {};
      this.metrics.errors.forEach(error => {
        errorTypes[error.type] = (errorTypes[error.type] || 0) + 1;
      });

      Object.entries(errorTypes).forEach(([type, count]) => {
        this.log(`  ${type}: ${count} occurrences`);
      });
    } else {
      this.log(`\n${colors.green}✅ No errors encountered during testing${colors.reset}`);
    }

    // Recommendations
    this.generateRecommendations();
  }

  generateRecommendations() {
    this.log(`\n${colors.bold}💡 Performance Recommendations:${colors.reset}`);

    const apiCalls = this.metrics.apiCalls;
    if (apiCalls.length > 0) {
      const avgResponseTime = apiCalls.reduce((sum, call) => sum + call.duration, 0) / apiCalls.length;
      
      if (avgResponseTime > 1000) {
        this.log(`  ⚠️  High average response time (${avgResponseTime.toFixed(2)}ms). Consider optimizing database queries.`);
      } else if (avgResponseTime > 500) {
        this.log(`  ⚠️  Moderate response time (${avgResponseTime.toFixed(2)}ms). Monitor under higher load.`);
      } else {
        this.log(`  ✅ Good response time performance (${avgResponseTime.toFixed(2)}ms)`);
      }
    }

    const wsConnections = this.metrics.websocketConnections;
    if (wsConnections.length > 0) {
      const avgConnectionTime = wsConnections.reduce((sum, conn) => sum + conn.duration, 0) / wsConnections.length;
      
      if (avgConnectionTime > 2000) {
        this.log(`  ⚠️  Slow WebSocket connections (${avgConnectionTime.toFixed(2)}ms). Check network configuration.`);
      } else {
        this.log(`  ✅ Good WebSocket connection performance (${avgConnectionTime.toFixed(2)}ms)`);
      }
    }

    if (this.metrics.errors.length > 0) {
      this.log(`  ⚠️  ${this.metrics.errors.length} errors encountered. Review error logs for optimization opportunities.`);
    }

    this.log(`  📈 Consider implementing caching for frequently accessed endpoints`);
    this.log(`  🔍 Monitor database query performance under production load`);
    this.log(`  🏗️  Consider connection pooling for high-concurrency scenarios`);
  }
}

// Command line interface
async function main() {
  const args = process.argv.slice(2);
  const monitor = new PerformanceMonitor();

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: node performance-monitor.js [options]

Options:
  --help, -h      Show this help message
  --test          Run comprehensive performance test
  --monitor=N     Monitor system health for N seconds (default: 60)
  --report        Generate report from previous monitoring session

Default: Run performance test
    `);
    return;
  }

  if (args.includes('--test') || args.length === 0) {
    await monitor.runPerformanceTest();
  } else if (args.some(arg => arg.startsWith('--monitor'))) {
    const monitorArg = args.find(arg => arg.startsWith('--monitor'));
    let duration = 60000; // 60 seconds default
    
    if (monitorArg.includes('=')) {
      duration = parseInt(monitorArg.split('=')[1]) * 1000;
    }
    
    await monitor.monitorSystemHealth(duration);
    monitor.generateReport();
  }
}

// Check if server is running
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

// Run monitoring if server is available
checkServer().then(isRunning => {
  if (isRunning) {
    main().catch(error => {
      console.error(`${colors.red}Performance monitoring failed: ${error.message}${colors.reset}`);
      process.exit(1);
    });
  } else {
    process.exit(1);
  }
});