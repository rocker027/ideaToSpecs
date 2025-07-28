#!/bin/bash

# Start script for Idea-to-Specs Generator
echo "🚀 Starting Idea-to-Specs Generator..."

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

# Function to check Gemini CLI installation and OAuth authentication
check_gemini_config() {
    echo "🔧 Checking Gemini CLI..."
    
    if ! command -v gemini &> /dev/null; then
        echo "⚠️  Gemini CLI is not installed or not in PATH."
        echo "   Please install Gemini CLI first: https://ai.google.dev/gemini-api/docs/cli"
        read -p "   Continue anyway? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
        return
    fi
    
    echo "✅ Gemini CLI is installed"
    
    # Test Gemini CLI with simple call (v0.1.1 doesn't support auth command)
    echo "🔐 測試 Gemini CLI 可用性..."
    if echo "test" | gemini -p "hi" > /dev/null 2>&1; then
        echo "✅ Gemini CLI 可正常使用"
    else
        echo "❌ Gemini CLI 無法正常使用"
        echo "   請檢查："
        echo "   1. Gemini CLI 是否正確安裝"
        echo "   2. 網路連線是否正常"
        echo "   3. API 設定是否正確"
        echo ""
        read -p "   Continue anyway? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
}

# Cleanup ports before starting
cleanup_ports

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ and try again."
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm and try again."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2)
REQUIRED_VERSION="18.0.0"

if [ "$(printf '%s\n' "$REQUIRED_VERSION" "$NODE_VERSION" | sort -V | head -n1)" != "$REQUIRED_VERSION" ]; then
    echo "❌ Node.js version $NODE_VERSION is not supported. Please install Node.js 18+ and try again."
    exit 1
fi

# Check Gemini CLI configuration
check_gemini_config

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "📦 Installing root dependencies..."
    npm install
fi

if [ ! -d "frontend/node_modules" ]; then
    echo "📦 Installing frontend dependencies..."
    cd frontend && npm install && cd ..
fi

if [ ! -d "backend/node_modules" ]; then
    echo "📦 Installing backend dependencies..."
    cd backend && npm install && cd ..
fi

# Check if concurrently is available
if ! npm list concurrently &> /dev/null; then
    echo "⚠️  Installing concurrently for parallel execution..."
    npm install concurrently --save-dev
fi

# Setup database
echo "🗄️  Setting up database..."
npm run setup:db

# Function to handle cleanup on exit
cleanup() {
    echo ""
    echo "🛑 Shutting down servers..."
    
    # Kill any processes using our ports
    local ports=(3000 3001)
    for port in "${ports[@]}"; do
        local pids=$(lsof -ti:$port 2>/dev/null)
        if [ -n "$pids" ]; then
            echo "   Stopping processes on port $port..."
            for pid in $pids; do
                kill -TERM $pid 2>/dev/null || kill -KILL $pid 2>/dev/null
            done
        fi
    done
    
    echo "✅ Servers stopped successfully"
    exit 0
}

# Set up signal handlers for clean shutdown
trap cleanup SIGINT SIGTERM

# Start the application
echo "🌐 Starting both frontend and backend servers..."
echo "   Frontend: http://localhost:3000"
echo "   Backend:  http://localhost:3001"
echo ""
echo "📝 Ready to generate specifications from your ideas!"
echo "   Press Ctrl+C to stop both servers"
echo ""

npm run dev