/**
 * WebSocket 記憶體洩漏修正驗證腳本
 * 驗證所有修正功能是否正常工作
 */

import { io as Client } from 'socket.io-client';
import fetch from 'node-fetch';

const SERVER_URL = 'http://localhost:3001';

class WebSocketFixValidator {
  constructor() {
    this.testResults = {
      healthCheck: false,
      connectionEstablishment: false,
      subscriptionTracking: false,
      memoryManagement: false,
      cleanup: false
    };
  }

  async validateHealthCheck() {
    console.log('🔍 Validating health check endpoint...');
    
    try {
      const response = await fetch(`${SERVER_URL}/api/health`);
      const health = await response.json();
      
      if (health.services?.websocket?.status === 'healthy') {
        console.log('✅ WebSocket health check passed');
        this.testResults.healthCheck = true;
      } else {
        throw new Error('WebSocket service is not healthy');
      }
    } catch (error) {
      console.error('❌ Health check failed:', error.message);
    }
  }

  async validateConnectionManagement() {
    console.log('🔍 Validating connection management...');
    
    return new Promise((resolve) => {
      const client = Client(SERVER_URL, { forceNew: true });
      
      client.on('connect', async () => {
        console.log('✅ Connection established successfully');
        this.testResults.connectionEstablishment = true;
        
        // 測試訂閱追蹤
        const jobId = `validation-job-${Date.now()}`;
        client.emit('subscribe-job', jobId);
        
        // 檢查服務器狀態
        setTimeout(async () => {
          try {
            const response = await fetch(`${SERVER_URL}/api/health`);
            const health = await response.json();
            
            if (health.services.websocket.activeConnections === 1) {
              console.log('✅ Connection tracking working correctly');
              this.testResults.subscriptionTracking = true;
            }
            
            // 測試斷線清理
            client.disconnect();
            
            setTimeout(async () => {
              try {
                const response = await fetch(`${SERVER_URL}/api/health`);
                const health = await response.json();
                
                if (health.services.websocket.activeConnections === 0) {
                  console.log('✅ Connection cleanup working correctly');
                  this.testResults.cleanup = true;
                }
                
                resolve();
              } catch (error) {
                console.error('❌ Cleanup validation failed:', error.message);
                resolve();
              }
            }, 1000);
            
          } catch (error) {
            console.error('❌ Connection tracking validation failed:', error.message);
            resolve();
          }
        }, 500);
      });
      
      client.on('connect_error', (error) => {
        console.error('❌ Connection failed:', error.message);
        resolve();
      });
    });
  }

  async validateMemoryManagement() {
    console.log('🔍 Validating memory management...');
    
    try {
      const initialResponse = await fetch(`${SERVER_URL}/api/health`);
      const initialHealth = await initialResponse.json();
      const initialMemory = initialHealth.system.memory.heapUsed;
      
      // 創建多個連線來測試記憶體管理
      const connections = [];
      const connectionCount = 10;
      
      for (let i = 0; i < connectionCount; i++) {
        const client = Client(SERVER_URL, { forceNew: true });
        connections.push(client);
        
        await new Promise((resolve) => {
          client.on('connect', () => {
            client.emit('subscribe-job', `memory-test-${i}`);
            resolve();
          });
        });
      }
      
      // 等待並檢查記憶體
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // 斷開所有連線
      connections.forEach(client => client.disconnect());
      
      // 等待清理完成
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const finalResponse = await fetch(`${SERVER_URL}/api/health`);
      const finalHealth = await finalResponse.json();
      const finalMemory = finalHealth.system.memory.heapUsed;
      
      const memoryGrowth = ((finalMemory - initialMemory) / initialMemory) * 100;
      
      if (finalHealth.services.websocket.activeConnections === 0 && memoryGrowth < 50) {
        console.log(`✅ Memory management working correctly (growth: ${memoryGrowth.toFixed(2)}%)`);
        this.testResults.memoryManagement = true;
      } else {
        console.log(`⚠️  Memory growth: ${memoryGrowth.toFixed(2)}%, Active connections: ${finalHealth.services.websocket.activeConnections}`);
      }
      
    } catch (error) {
      console.error('❌ Memory management validation failed:', error.message);
    }
  }

  async runAllValidations() {
    console.log('🚀 Starting WebSocket fix validation...\n');
    
    await this.validateHealthCheck();
    await this.validateConnectionManagement();
    await this.validateMemoryManagement();
    
    console.log('\n📊 Validation Results:');
    
    let passedTests = 0;
    const totalTests = Object.keys(this.testResults).length;
    
    for (const [test, result] of Object.entries(this.testResults)) {
      const status = result ? '✅' : '❌';
      console.log(`  ${status} ${test}: ${result ? 'PASSED' : 'FAILED'}`);
      if (result) passedTests++;
    }
    
    console.log(`\n📈 Overall Result: ${passedTests}/${totalTests} tests passed`);
    
    if (passedTests === totalTests) {
      console.log('🎉 All WebSocket memory leak fixes are working correctly!');
      return true;
    } else {
      console.log('⚠️  Some validations failed. Please review the implementation.');
      return false;
    }
  }
}

// 執行驗證
if (import.meta.url === `file://${process.argv[1]}`) {
  const validator = new WebSocketFixValidator();
  
  validator.runAllValidations()
    .then((success) => {
      process.exit(success ? 0 : 1);
    })
    .catch((error) => {
      console.error('💥 Validation failed:', error.message);
      process.exit(1);
    });
}

export default WebSocketFixValidator;