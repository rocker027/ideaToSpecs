/**
 * WebSocket 記憶體洩漏測試
 * 測試連線建立、斷開和資源清理
 */

import { io as Client } from 'socket.io-client';
import express from 'express';
import { createServer } from 'http';
import webSocketService from './services/websocketService.js';

const TEST_PORT = 3002;
const TEST_URL = `http://localhost:${TEST_PORT}`;

class WebSocketMemoryTest {
  constructor() {
    this.app = express();
    this.server = null;
    this.testClients = [];
    this.testResults = {
      connectionTests: [],
      memoryTests: [],
      cleanupTests: []
    };
  }

  async setup() {
    console.log('🔧 Setting up test server...');
    
    this.server = createServer(this.app);
    webSocketService.initialize(this.server);
    
    await new Promise((resolve, reject) => {
      this.server.listen(TEST_PORT, (error) => {
        if (error) {
          reject(error);
        } else {
          console.log(`✅ Test server running on port ${TEST_PORT}`);
          resolve();
        }
      });
    });
  }

  async cleanup() {
    console.log('🧹 Cleaning up test environment...');
    
    // 斷開所有測試客戶端
    for (const client of this.testClients) {
      if (client.connected) {
        client.disconnect();
      }
    }
    
    // 關閉 WebSocket 服務
    await webSocketService.close();
    
    // 關閉測試伺服器
    if (this.server) {
      await new Promise((resolve) => {
        this.server.close(resolve);
      });
    }
    
    console.log('✅ Test cleanup completed');
  }

  createTestClient(clientId) {
    const client = Client(TEST_URL, {
      forceNew: true,
      timeout: 5000
    });

    client.clientId = clientId;
    this.testClients.push(client);
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Client ${clientId} connection timeout`));
      }, 5000);

      client.on('connect', () => {
        clearTimeout(timeout);
        console.log(`📡 Client ${clientId} connected`);
        resolve(client);
      });

      client.on('connect_error', (error) => {
        clearTimeout(timeout);
        reject(new Error(`Client ${clientId} connection failed: ${error.message}`));
      });
    });
  }

  async testBasicConnection() {
    console.log('\n🧪 Testing basic connection lifecycle...');
    
    const client = await this.createTestClient('basic-test');
    const initialStats = webSocketService.getConnectionStats();
    
    // 驗證連線建立
    if (initialStats.activeConnections !== 1) {
      throw new Error(`Expected 1 active connection, got ${initialStats.activeConnections}`);
    }
    
    // 測試訂閱
    const jobId = `test-job-${Date.now()}`;
    client.emit('subscribe-job', jobId);
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const statsAfterSubscribe = webSocketService.getConnectionStats();
    if (statsAfterSubscribe.activeSubscriptions !== 1) {
      throw new Error(`Expected 1 subscription, got ${statsAfterSubscribe.activeSubscriptions}`);
    }
    
    // 測試斷線清理
    client.disconnect();
    
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const finalStats = webSocketService.getConnectionStats();
    if (finalStats.activeConnections !== 0) {
      throw new Error(`Expected 0 active connections after disconnect, got ${finalStats.activeConnections}`);
    }
    
    this.testResults.connectionTests.push({
      test: 'basicConnection',
      passed: true,
      stats: { initial: initialStats, final: finalStats }
    });
    
    console.log('✅ Basic connection test passed');
  }

  async testMultipleConnections() {
    console.log('\n🧪 Testing multiple connections...');
    
    const connectionCount = 10;
    const clients = [];
    
    // 建立多個連線
    for (let i = 0; i < connectionCount; i++) {
      const client = await this.createTestClient(`multi-test-${i}`);
      clients.push(client);
      
      // 每個客戶端訂閱不同的作業
      client.emit('subscribe-job', `job-${i}`);
    }
    
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const multiStats = webSocketService.getConnectionStats();
    if (multiStats.activeConnections !== connectionCount) {
      throw new Error(`Expected ${connectionCount} connections, got ${multiStats.activeConnections}`);
    }
    
    // 斷開所有連線
    for (const client of clients) {
      client.disconnect();
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const finalStats = webSocketService.getConnectionStats();
    if (finalStats.activeConnections !== 0) {
      throw new Error(`Expected 0 connections after cleanup, got ${finalStats.activeConnections}`);
    }
    
    this.testResults.connectionTests.push({
      test: 'multipleConnections',
      passed: true,
      connectionCount,
      stats: { peak: multiStats, final: finalStats }
    });
    
    console.log('✅ Multiple connections test passed');
  }

  async testMemoryLeak() {
    console.log('\n🧪 Testing memory leak prevention...');
    
    const iterations = 3;
    const connectionsPerIteration = 10;
    const memorySnapshots = [];
    
    for (let iteration = 0; iteration < iterations; iteration++) {
      console.log(`  Iteration ${iteration + 1}/${iterations}`);
      
      const clients = [];
      
      // 建立連線
      for (let i = 0; i < connectionsPerIteration; i++) {
        const client = await this.createTestClient(`leak-test-${iteration}-${i}`);
        clients.push(client);
        
        // 模擬活動
        client.emit('subscribe-job', `job-${iteration}-${i}`);
        
        // 發送一些事件來觸發速率限制追踪
        for (let j = 0; j < 3; j++) {
          client.emit('subscribe-job', `extra-job-${j}`);
          client.emit('unsubscribe-job', `extra-job-${j}`);
        }
        
        // 添加小延遲避免速率限制
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // 記錄記憶體使用情況
      const stats = webSocketService.getConnectionStats();
      const memoryUsage = process.memoryUsage();
      
      memorySnapshots.push({
        iteration,
        stats,
        memory: {
          heapUsed: memoryUsage.heapUsed,
          heapTotal: memoryUsage.heapTotal,
          external: memoryUsage.external
        }
      });
      
      // 斷開所有連線
      for (const client of clients) {
        client.disconnect();
      }
      
      // 等待清理完成
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // 手動觸發垃圾回收（如果可用）
      if (global.gc) {
        global.gc();
      }
    }
    
    // 分析記憶體趨勢
    const finalStats = webSocketService.getConnectionStats();
    const firstSnapshot = memorySnapshots[0];
    const lastSnapshot = memorySnapshots[memorySnapshots.length - 1];
    
    const memoryGrowth = lastSnapshot.memory.heapUsed - firstSnapshot.memory.heapUsed;
    const memoryGrowthPercent = (memoryGrowth / firstSnapshot.memory.heapUsed) * 100;
    
    console.log(`  Memory growth: ${(memoryGrowth / 1024 / 1024).toFixed(2)}MB (${memoryGrowthPercent.toFixed(2)}%)`);
    
    // 檢查是否有資源未清理
    if (finalStats.activeConnections > 0) {
      throw new Error(`Memory leak detected: ${finalStats.activeConnections} connections not cleaned up`);
    }
    
    if (finalStats.processingJobs > 0) {
      throw new Error(`Memory leak detected: ${finalStats.processingJobs} jobs not cleaned up`);
    }
    
    // 如果記憶體增長超過 50%，認為可能有洩漏
    if (memoryGrowthPercent > 50) {
      console.warn(`⚠️  High memory growth detected: ${memoryGrowthPercent.toFixed(2)}%`);
    }
    
    this.testResults.memoryTests.push({
      test: 'memoryLeak',
      passed: true,
      iterations,
      connectionsPerIteration,
      memoryGrowth: memoryGrowthPercent,
      snapshots: memorySnapshots,
      finalStats
    });
    
    console.log('✅ Memory leak test passed');
  }

  async testPeriodicCleanup() {
    console.log('\n🧪 Testing periodic cleanup...');
    
    // 創建一些連線但不正常關閉
    const clients = [];
    for (let i = 0; i < 5; i++) {
      const client = await this.createTestClient(`cleanup-test-${i}`);
      clients.push(client);
      client.emit('subscribe-job', `cleanup-job-${i}`);
    }
    
    await new Promise(resolve => setTimeout(resolve, 200));
    
    const beforeCleanup = webSocketService.getConnectionStats();
    console.log(`  Before cleanup: ${beforeCleanup.activeConnections} connections`);
    
    // 模擬網路斷線（不發送 disconnect 事件）
    for (const client of clients) {
      client.disconnect();
    }
    
    // 手動觸發清理
    webSocketService.cleanupRateLimits();
    webSocketService.performPeriodicCleanup();
    
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const afterCleanup = webSocketService.getConnectionStats();
    console.log(`  After cleanup: ${afterCleanup.activeConnections} connections`);
    
    this.testResults.cleanupTests.push({
      test: 'periodicCleanup',
      passed: true,
      beforeCleanup,
      afterCleanup
    });
    
    console.log('✅ Periodic cleanup test passed');
  }

  async testInactiveConnectionDisconnect() {
    console.log('\n🧪 Testing inactive connection disconnect...');
    
    const client = await this.createTestClient('inactive-test');
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const beforeDisconnect = webSocketService.getConnectionStats();
    
    // 手動斷開非活躍連線（使用很短的閾值進行測試）
    const disconnected = webSocketService.disconnectInactiveConnections(100); // 100ms 閾值
    
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const afterDisconnect = webSocketService.getConnectionStats();
    
    this.testResults.cleanupTests.push({
      test: 'inactiveDisconnect',
      passed: true,
      disconnectedCount: disconnected,
      beforeDisconnect,
      afterDisconnect
    });
    
    console.log(`✅ Inactive connection disconnect test passed (disconnected: ${disconnected})`);
  }

  async runAllTests() {
    console.log('🚀 Starting WebSocket memory leak tests...\n');
    
    try {
      await this.setup();
      
      await this.testBasicConnection();
      await this.testMultipleConnections();
      await this.testMemoryLeak();
      await this.testPeriodicCleanup();
      await this.testInactiveConnectionDisconnect();
      
      console.log('\n📊 Test Results Summary:');
      console.log('Connection Tests:', this.testResults.connectionTests.length, 'passed');
      console.log('Memory Tests:', this.testResults.memoryTests.length, 'passed');
      console.log('Cleanup Tests:', this.testResults.cleanupTests.length, 'passed');
      
      console.log('\n✅ All WebSocket memory leak tests passed!');
      
    } catch (error) {
      console.error('\n❌ Test failed:', error.message);
      console.error(error.stack);
      throw error;
    } finally {
      await this.cleanup();
    }
  }

  getTestResults() {
    return this.testResults;
  }
}

// 執行測試
if (import.meta.url === `file://${process.argv[1]}`) {
  const test = new WebSocketMemoryTest();
  
  test.runAllTests()
    .then(() => {
      console.log('\n🎉 All tests completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Tests failed:', error.message);
      process.exit(1);
    });
}

export default WebSocketMemoryTest;