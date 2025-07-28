/**
 * WebSocket 整合測試
 * 測試修正後的 WebSocket 功能是否正常工作
 */

import { io as Client } from 'socket.io-client';

const SERVER_URL = 'http://localhost:3001';

async function testWebSocketIntegration() {
  console.log('🔄 Testing WebSocket integration...');
  
  // 創建 WebSocket 客戶端
  const client = Client(SERVER_URL, {
    forceNew: true,
    timeout: 5000
  });
  
  return new Promise((resolve, reject) => {
    let testResults = {
      connected: false,
      subscribed: false,
      jobUpdateReceived: false,
      disconnected: false
    };
    
    // 設置超時
    const timeout = setTimeout(() => {
      client.disconnect();
      reject(new Error('Test timeout'));
    }, 10000);
    
    // 連線成功
    client.on('connect', () => {
      console.log('✅ WebSocket connected successfully');
      testResults.connected = true;
      
      // 測試訂閱作業更新
      const testJobId = `test-job-${Date.now()}`;
      client.emit('subscribe-job', testJobId);
      
      console.log(`📡 Subscribed to job: ${testJobId}`);
      testResults.subscribed = true;
      
      // 模擬接收作業更新
      setTimeout(() => {
        client.emit('job-update', {
          jobId: testJobId,
          status: 'completed',
          message: 'Test job completed'
        });
      }, 1000);
    });
    
    // 接收作業更新
    client.on('job-update', (update) => {
      console.log('📩 Received job update:', update);
      testResults.jobUpdateReceived = true;
    });
    
    // 連線錯誤
    client.on('connect_error', (error) => {
      clearTimeout(timeout);
      console.error('❌ WebSocket connection failed:', error.message);
      reject(error);
    });
    
    // 斷線
    client.on('disconnect', (reason) => {
      clearTimeout(timeout);
      console.log('🔌 WebSocket disconnected:', reason);
      testResults.disconnected = true;
      
      // 檢查測試結果
      const allTestsPassed = Object.values(testResults).every(result => result === true);
      
      if (allTestsPassed) {
        console.log('✅ All WebSocket integration tests passed');
        resolve(testResults);
      } else {
        console.log('❌ Some WebSocket tests failed:', testResults);
        reject(new Error('WebSocket integration test failed'));
      }
    });
    
    // 3 秒後主動斷開
    setTimeout(() => {
      client.disconnect();
    }, 3000);
  });
}

// 執行測試
if (import.meta.url === `file://${process.argv[1]}`) {
  testWebSocketIntegration()
    .then((results) => {
      console.log('🎉 WebSocket integration test completed successfully!');
      console.log('Results:', results);
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 WebSocket integration test failed:', error.message);
      process.exit(1);
    });
}

export default testWebSocketIntegration;