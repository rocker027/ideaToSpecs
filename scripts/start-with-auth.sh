#!/bin/bash
# scripts/start-with-auth.sh

echo "🔐 測試 Gemini CLI 可用性..."
if ! echo "test" | gemini -p "hi" > /dev/null 2>&1; then
  echo "❌ Gemini CLI 無法正常使用"
  echo "請檢查："
  echo "  1. Gemini CLI 是否正確安裝"
  echo "  2. 網路連線是否正常"  
  echo "  3. API 設定是否正確"
  echo ""
  echo "Gemini CLI v0.1.1 不支援 auth 命令，請確保已正確設定"
  exit 1
fi

echo "✅ Gemini CLI 可正常使用"
echo "🚀 啟動應用程式..."

# Function to check and cleanup ports
cleanup_ports() {
    local ports=(3000 3001)
    
    for port in "${ports[@]}"; do
        echo "🔍 Checking port $port..."
        
        # Find processes using the port
        local pids=$(lsof -ti:$port 2>/dev/null)
        
        if [ -n "$pids" ]; then
            echo "⚠️  Port $port is already in use by process(es): $pids"
            echo "   Terminating processes to free up port..."
            
            # Kill the processes
            for pid in $pids; do
                echo "   Killing process $pid..."
                kill -TERM $pid 2>/dev/null || kill -KILL $pid 2>/dev/null
            done
            
            # Wait a moment for cleanup
            sleep 2
            
            # Verify port is free
            local remaining_pids=$(lsof -ti:$port 2>/dev/null)
            if [ -n "$remaining_pids" ]; then
                echo "❌ Failed to free port $port. Forcing kill..."
                for pid in $remaining_pids; do
                    kill -KILL $pid 2>/dev/null
                done
                sleep 1
            fi
            
            echo "✅ Port $port is now available"
        else
            echo "✅ Port $port is available"
        fi
    done
}

# Cleanup ports before starting
cleanup_ports

# Change to backend directory and start backend (保留使用者環境)
cd backend && npm run dev &
BACKEND_PID=$!
echo "🟢 Backend started with PID: $BACKEND_PID"

# Wait a moment for backend to start
sleep 3

# Change to frontend directory and start frontend
cd ../frontend && npm run dev &
FRONTEND_PID=$!
echo "🟢 Frontend started with PID: $FRONTEND_PID"

echo ""
echo "✅ 應用程式已啟動"
echo "   前端: http://localhost:3000"
echo "   後端: http://localhost:3001"
echo ""
echo "   Press Ctrl+C to stop both servers"

# Function to handle cleanup on exit
cleanup() {
    echo ""
    echo "🛑 Stopping servers..."
    if [ ! -z "$BACKEND_PID" ]; then
        kill $BACKEND_PID 2>/dev/null
        echo "   Backend stopped"
    fi
    if [ ! -z "$FRONTEND_PID" ]; then
        kill $FRONTEND_PID 2>/dev/null
        echo "   Frontend stopped"
    fi
    echo "✅ All servers stopped"
    exit 0
}

# Set up signal handlers
trap cleanup INT TERM

# Wait for either process to exit
wait