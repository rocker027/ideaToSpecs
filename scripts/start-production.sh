#!/bin/bash

# Production startup script for Idea-to-Specs Generator
echo "🚀 Starting Idea-to-Specs Generator (Production Mode)..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ and try again."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2)
REQUIRED_VERSION="18.0.0"

if [ "$(printf '%s\n' "$REQUIRED_VERSION" "$NODE_VERSION" | sort -V | head -n1)" != "$REQUIRED_VERSION" ]; then
    echo "❌ Node.js version $NODE_VERSION is not supported. Please install Node.js 18+ and try again."
    exit 1
fi

echo "✅ Node.js version $NODE_VERSION detected"

# Check if Gemini CLI is installed
if ! command -v gemini &> /dev/null; then
    echo "⚠️  Gemini CLI is not installed or not in PATH."
    echo "   Please install Gemini CLI first: https://ai.google.dev/gemini-api/docs/cli"
    read -p "   Continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Set production environment
export NODE_ENV=production

# Ensure production environment file exists
if [ ! -f "backend/.env.production" ]; then
    echo "📝 Creating production environment configuration..."
    cp backend/.env.example backend/.env.production
fi

# Copy production environment to main .env
cp backend/.env.production backend/.env

# Build frontend if dist doesn't exist
if [ ! -d "frontend/dist" ]; then
    echo "🔨 Building frontend for production..."
    npm run build:frontend
fi

# Initialize database if needed
echo "🗄️  Initializing database..."
npm run setup:db

# Start the application
echo ""
echo "🎉 Starting application in production mode..."
echo "   Backend: http://localhost:3001"
echo "   Frontend: http://localhost:3000"
echo ""
echo "📋 To stop the application, press Ctrl+C"
echo ""

# Start both frontend and backend
npm start
