# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Idea-to-Specs Generator is a production-ready local web application that converts user ideas into product development specifications using Gemini CLI integration. The application features a React frontend with real-time progress tracking, a robust Express.js backend with WebSocket support, and Turso Database for persistence.

**Status**: All 5 development phases completed, production-ready deployment with 100% validation test success.

## Architecture

### Monorepo Structure
- **Root**: npm workspaces configuration with concurrent execution scripts
- **frontend/**: React 19 application with Vite, Socket.IO client, comprehensive UI components
- **backend/**: Express.js API server with WebSocket support, structured logging, performance monitoring
- **database/**: Enhanced SQLite/Turso database with performance metrics and health logging
- **scripts/**: Production deployment, installation, and database setup scripts

### Technology Stack
- **Frontend**: React 19, Vite, Socket.IO-client, React Markdown, Axios, responsive CSS
- **Backend**: Express.js, Socket.IO, Pino logging, Helmet security, express-rate-limit, Joi validation
- **Database**: Turso (libSQL) with local SQLite fallback, performance optimization with indexes
- **Real-time**: WebSocket communication via Socket.IO for live progress tracking
- **External**: Gemini CLI integration with retry logic and timeout handling

## Development Commands

### Setup and Installation
```bash
# Production setup
./scripts/install.sh          # Complete installation with validation
npm run setup                 # Install dependencies and setup database

# Development servers
./scripts/start.sh            # Start both servers with health checks + port cleanup
./scripts/start-with-auth.sh  # Start with strict OAuth authentication check
npm run dev                   # Concurrent frontend (:3000) and backend (:3001)
npm run dev:frontend          # React dev server only
npm run dev:backend           # Express server only (with nodemon for auto-reload)
```

### Production and Testing
```bash
# Production deployment
npm run start:production      # Production build and deployment
npm run build                 # Build frontend for production

# Testing and validation
npm test                      # Run backend API tests
npm run validate              # Complete deployment validation (11 tests)
npm run monitor               # Performance monitoring and metrics
```

### Database and Maintenance
```bash
npm run setup:db             # Initialize enhanced database schema
# Database includes: ideas, performance_metrics tables with indexes
```

## API Architecture

### Enhanced Backend Endpoints (server.js)
- `POST /api/generate` - Generate specification with WebSocket progress updates
- `GET /api/history?page=1&limit=20&search=query` - Paginated history with search
- `GET /api/spec/:id` - Retrieve specific specification with metadata
- `GET /api/download/:id` - Download formatted Markdown with smart naming
- `DELETE /api/history/:id` - Delete with validation and confirmation
- `GET /api/health` - Comprehensive health check with system metrics
- `GET /api/gemini/health` - Gemini CLI specific health and latency check
- `GET /api/docs` - Auto-generated API documentation
- `GET /status` - Real-time performance monitoring dashboard

### WebSocket Events (Socket.IO)
- `connection` - Client WebSocket connection established
- `subscribe-job` - Subscribe to real-time job progress updates
- `job-update` - Receive live status updates (started → processing → completed/failed)
- `unsubscribe-job` - Unsubscribe from job updates
- `disconnect` - Connection cleanup and tracking

### Enhanced Database Schema
```sql
CREATE TABLE ideas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_input TEXT NOT NULL,
  generated_spec TEXT NOT NULL,
  status TEXT DEFAULT 'completed' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  processing_time_ms INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE performance_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  status_code INTEGER NOT NULL,
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Performance optimized indexes
CREATE INDEX idx_ideas_created_at ON ideas(created_at DESC);
CREATE INDEX idx_ideas_status ON ideas(status);
CREATE INDEX idx_performance_created_at ON performance_metrics(created_at DESC);
```

## Core Components

### Advanced Backend Integration (server.js)
- **Enhanced Gemini CLI**: Exponential backoff retry, timeout handling, process management with WebSocket progress broadcasting
- **Security Middleware**: Helmet.js security headers, CORS configuration, tiered rate limiting (general + generation-specific)
- **Real-time Communication**: Socket.IO WebSocket server with job subscription/unsubscription, connection tracking
- **Structured Logging**: Pino logger with development/production modes, performance metric tracking
- **Database Client**: Turso libSQL client with connection pooling, automated maintenance (VACUUM)
- **Validation Layer**: Joi schemas and express-validator for comprehensive input validation

### Production Frontend Components (frontend/src/components/)
- **IdeaInput.jsx**: Advanced form with character counting, validation, keyboard shortcuts (Ctrl+Enter)
- **SpecificationPreview.jsx**: React Markdown renderer with custom styling, copy functionality
- **HistoryPanel.jsx**: Paginated history with real-time search, delete confirmation dialogs
- **ActionButtons.jsx**: Copy-to-clipboard with browser compatibility fallback, smart file download
- **ProgressIndicator.jsx**: Real-time WebSocket progress tracking with spinner animations
- **ToastProvider.jsx**: Global notification system for success/error states
- **ConnectionStatus.jsx**: WebSocket connection status monitoring and auto-reconnection

### Advanced Hooks and Services
- **useKeyboardShortcuts.jsx**: Global keyboard shortcut management
- **api.js**: Enhanced API client with WebSocket integration, automatic retry logic, timeout handling

## Development Guidelines

### Backend Development Standards
- **ES Modules**: Consistent import/export throughout codebase
- **Modular Architecture**: Server organized into services (database, websocket, gemini), middleware (security, logging, validation), controllers, and routes
- **Security First**: Parameterized queries, input validation, security headers, rate limiting
- **Error Handling**: Structured error responses with timestamps, development vs production error details
- **Performance**: Database indexing, connection pooling, request timing, automated maintenance
- **Logging**: Structured JSON logging with Pino, request/response tracking, performance metrics

### Frontend Development Patterns
- **React 19**: Functional components with hooks, modern React patterns
- **Real-time UX**: WebSocket integration with polling fallback, live progress indicators
- **Accessibility**: ARIA labels, keyboard navigation, screen reader support
- **Responsive Design**: Mobile-first CSS, flexible layouts, device optimization
- **Error Recovery**: Graceful error handling, automatic retries, user-friendly error messages

### Database Operations Excellence
- **Performance Optimized**: Indexed queries, connection pooling, VACUUM maintenance
- **Enhanced Schema**: Status tracking, processing times, performance metrics
- **Data Integrity**: Parameterized queries, transaction handling, constraint validation

## Environment Configuration

### Production Environment (.env)
```bash
# Server Configuration
PORT=3001
NODE_ENV=production

# Database Configuration (optional - uses local SQLite fallback)
TURSO_DATABASE_URL=libsql://your-database.turso.io
TURSO_AUTH_TOKEN=your-auth-token

# Performance Settings
REQUEST_TIMEOUT=120000
MAX_RETRIES=2
RATE_LIMIT_WINDOW=900000  # 15 minutes
RATE_LIMIT_MAX=100
```

### Prerequisites & OAuth Configuration
- **Node.js 18+** (tested with 18.x, 20.x)
- **Gemini CLI** 使用 Google OAuth 認證
  ```bash
  # 安裝 Gemini CLI
  npm install -g @google/gemini-cli
  
  # 使用 Google 帳號登入（重要！）
  gemini auth login
  
  # 確認授權狀態
  gemini auth status
  ```
- **npm 9+** for workspace support
- **Modern Browser** (Chrome 88+, Firefox 78+, Safari 14+)

### OAuth 整合注意事項
- Gemini CLI 使用 OAuth 而非 API key
- 必須在執行 Node.js 的相同使用者環境下完成授權
- 授權 token 儲存在使用者的 home 目錄
- 如果遇到授權問題，請確認：
  1. 使用相同的使用者帳號執行 `gemini auth login` 和啟動服務器
  2. 不要使用 sudo 或不同的使用者權限
  3. 確保 HOME 環境變數正確設置

## Production Testing & Validation

### Comprehensive Testing Suite
```bash
# Backend API Testing (test-api.js)
npm test                    # 14 functional tests + WebSocket validation
npm run test:load          # Concurrent request load testing
npm run test:examples      # Usage examples and documentation

# Deployment Validation (validate-deployment.js)
npm run validate           # 11-test validation suite (100% success required)

# Performance Monitoring
npm run monitor            # Real-time performance metrics and system health
```

### Testing Coverage Areas
- **API Endpoints**: All REST endpoints with proper error handling validation
- **WebSocket Communication**: Connection establishment, job subscription, real-time updates
- **Database Performance**: Query optimization, connection handling, data integrity
- **Security Middleware**: Rate limiting, CORS, input validation, security headers
- **Error Recovery**: Gemini CLI failures, network issues, database connection problems

### Backend Test Scripts
```bash
# Individual test categories
npm run test:load              # Load testing with concurrent requests
npm run test:examples          # Usage examples and documentation validation
node backend/test-*.js         # Run specific test files (test-api.js, test-websocket-integration.js, etc.)
```

## Advanced Architecture Features

### Real-time Progress Tracking (WebSocket)
```javascript
// Backend: Job progress broadcasting (server.js:92)
const emitJobUpdate = (jobId, status, data = {}) => {
  io.to(`job-${jobId}`).emit('job-update', {
    jobId, status, timestamp: new Date().toISOString(), ...data
  });
};

// Frontend: WebSocket subscription (api.js)
socket.on('job-update', (update) => {
  // Handle real-time progress updates
});
```

### Enhanced Error Handling
- **Structured Responses**: Consistent error format with timestamps and request context
- **Development vs Production**: Detailed errors in development, sanitized in production  
- **Retry Logic**: Exponential backoff for transient failures
- **Circuit Breaker**: Automatic service degradation for persistent failures

### Performance Monitoring Dashboard
- **Real-time Metrics**: Available at `/status` endpoint with CPU, memory, response times
- **Database Performance**: Query timing, connection pool status, maintenance logs
- **API Analytics**: Request rates, error rates, processing times per endpoint
- **System Health**: Uptime, memory usage, Gemini CLI availability

## Security Implementation

### Production Security Features
- **Helmet.js**: Comprehensive security headers (CSP, HSTS, etc.)
- **Rate Limiting**: Tiered limits (100 req/15min general, 10 req/5min for generation)
- **Input Validation**: Joi schemas with sanitization and type checking
- **CORS Configuration**: Environment-based origin restrictions
- **SQL Injection Protection**: Parameterized queries throughout
- **Error Information Disclosure**: Limited error details in production mode

## Development Architecture Notes

### Key Implementation Details
- **Server Architecture**: Modularized Express.js server with class-based initialization (`IdeaToSpecsServer`)
- **Frontend State Management**: React hooks-based state with context providers for toasts and error boundaries
- **WebSocket Integration**: Socket.IO with job-based subscriptions and progress tracking
- **Accessibility Features**: Comprehensive ARIA support, keyboard navigation, and screen reader compatibility
- **Error Recovery**: Automatic retries, graceful degradation, and user-friendly error messages

### Port Management
- Frontend runs on port 3000 (Vite dev server)
- Backend runs on port 3001 (Express server)
- Start script automatically cleans up ports to prevent conflicts

### Key Files for Future Development
- `backend/server.js`: Main server entry point with modular initialization
- `backend/services/`: Core business logic (database, websocket, gemini)
- `backend/middleware/`: Security, logging, validation, and error handling
- `frontend/src/App.jsx`: Main React application with hooks and state management
- `frontend/src/services/api.js`: API client with WebSocket integration

This is a production-ready application with enterprise-level features including real-time communication, comprehensive monitoring, security hardening, and automated testing validation.