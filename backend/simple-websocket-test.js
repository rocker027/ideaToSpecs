/**
 * 簡單的 WebSocket 連線測試
 */

import { io as Client } from 'socket.io-client';

const SERVER_URL = 'http://localhost:3001';

async function testWebSocketConnection() {
  console.log('🔄 Testing single WebSocket connection...');
  
  // 檢查初始狀態
  const initialResponse = await fetch(`${SERVER_URL}/api/health`);
  const initialHealth = await initialResponse.json();
  console.log('📊 Initial state:', {
    activeConnections: initialHealth.services.websocket.activeConnections,
    heapUsed: Math.round(initialHealth.system.memory.heapUsed / 1024 / 1024) + 'MB'
  });
  
  // 創建單個連線
  const client = Client(SERVER_URL, { 
    forceNew: true,
    transports: ['polling'],
    timeout: 10000,
    autoConnect: true,
    upgrade: false
  });
  
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      console.log('⏰ Test timeout');
      client.disconnect();
      reject(new Error('Test timeout'));
    }, 10000);
    
    client.on('connect', async () => {
      console.log('✅ WebSocket connected');
      
      // 檢查連線後狀態
      const connectedResponse = await fetch(`${SERVER_URL}/api/health`);
      const connectedHealth = await connectedResponse.json();
      console.log('📊 Connected state:', {
        activeConnections: connectedHealth.services.websocket.activeConnections,
        heapUsed: Math.round(connectedHealth.system.memory.heapUsed / 1024 / 1024) + 'MB'
      });
      
      // 測試訂閱
      const jobId = `test-${Date.now()}`;
      client.emit('subscribe-job', jobId);
      console.log('📡 Subscribed to job:', jobId);
      
      // 等待一段時間後斷開
      setTimeout(() => {
        client.disconnect();
      }, 2000);
    });
    
    client.on('disconnect', async (reason) => {
      clearTimeout(timeout);
      console.log('🔌 WebSocket disconnected:', reason);
      
      // 等待清理完成
      setTimeout(async () => {
        const finalResponse = await fetch(`${SERVER_URL}/api/health`);
        const finalHealth = await finalResponse.json();
        console.log('📊 Final state:', {
          activeConnections: finalHealth.services.websocket.activeConnections,
          heapUsed: Math.round(finalHealth.system.memory.heapUsed / 1024 / 1024) + 'MB'
        });
        
        if (finalHealth.services.websocket.activeConnections === 0) {
          console.log('✅ Connection properly cleaned up');
          resolve(true);
        } else {
          console.log('❌ Connection not cleaned up');
          resolve(false);
        }
      }, 1000);
    });
    
    client.on('connect_error', (error) => {
      clearTimeout(timeout);
      console.error('❌ Connection error:', error.message);
      reject(error);
    });
  });
}

// 執行測試
if (import.meta.url === `file://${process.argv[1]}`) {
  testWebSocketConnection()
    .then((success) => {
      if (success) {
        console.log('🎉 WebSocket connection test passed!');
      } else {
        console.log('⚠️  WebSocket connection test had issues');
      }
      process.exit(success ? 0 : 1);
    })
    .catch((error) => {
      console.error('💥 Test failed:', error.message);
      process.exit(1);
    });
}