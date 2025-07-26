#!/bin/bash

# Installation script for Idea-to-Specs Generator
echo "📦 Installing Idea-to-Specs Generator..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    echo "   Visit: https://nodejs.org/"
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2)
REQUIRED_VERSION="18.0.0"

if [ "$(printf '%s\n' "$REQUIRED_VERSION" "$NODE_VERSION" | sort -V | head -n1)" != "$REQUIRED_VERSION" ]; then
    echo "❌ Node.js version $NODE_VERSION is not supported. Please install Node.js 18+."
    exit 1
fi

echo "✅ Node.js version $NODE_VERSION detected"

# Install all dependencies
echo "📦 Installing all dependencies..."
npm run install:all

# Setup database
echo "🗄️  Setting up database..."
npm run setup:db

echo ""
echo "🎉 Installation completed successfully!"
echo ""
echo "To start the application, run:"
echo "   ./scripts/start.sh"
echo "   or"
echo "   npm start"
echo ""
echo "📋 Next steps:"
echo "   1. Make sure Gemini CLI is installed and configured"
echo "   2. Run the start script to launch the application"
echo "   3. Open http://localhost:3000 in your browser"