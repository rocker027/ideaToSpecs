# Idea-to-Specifications Backend API

A robust Express.js backend API that converts user ideas into detailed product development specifications using Gemini CLI integration.

## 🚀 Features

- **Gemini CLI Integration**: Leverages Google's Gemini CLI for AI-powered specification generation
- **Enhanced Security**: Helmet.js security headers, CORS protection, rate limiting
- **Input Validation**: Comprehensive request validation using Joi and express-validator
- **Database Persistence**: Turso database integration for storing ideas and specifications
- **Pagination & Search**: Advanced history querying with pagination and full-text search
- **Error Handling**: Structured error responses with detailed logging
- **Performance Monitoring**: Request timing, retry logic, and timeout handling
- **Graceful Degradation**: Handles Gemini CLI failures with proper error messages

## 📋 Prerequisites

- Node.js 18+ 
- Gemini CLI installed and configured
- Turso database access (or local SQLite)
- npm/yarn package manager

## 🛠️ Installation

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. Start the development server:
```bash
npm run dev
```

## 🌍 Environment Variables

```env
# Server Configuration
PORT=3001
NODE_ENV=development

# Database Configuration
TURSO_DATABASE_URL=your_turso_database_url
TURSO_AUTH_TOKEN=your_turso_auth_token

# CORS Configuration (production)
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
```

## 📚 API Endpoints

### POST `/api/generate`
Generate a product specification from an idea.

**Rate Limit**: 10 requests per 5 minutes

**Request Body**:
```json
{
  "idea": "Create a mobile app for tracking daily water intake with reminders"
}
```

**Validation**:
- `idea`: String, 10-5000 characters, required

**Response** (200):
```json
{
  "id": 123,
  "userInput": "Create a mobile app...",
  "generatedSpec": "# Product Development Specification...",
  "status": "completed",
  "processingTime": 5432,
  "geminiDuration": 4821,
  "attempt": 1,
  "createdAt": "2025-07-25T10:30:00.000Z"
}
```

### GET `/api/history`
Retrieve paginated history of generated specifications.

**Query Parameters**:
- `page`: Integer, default 1
- `limit`: Integer, 1-100, default 20
- `search`: String, optional search term

**Response** (200):
```json
{
  "data": [
    {
      "id": 123,
      "user_input": "Create a mobile app...",
      "preview": "# Product Development Specification...",
      "status": "completed",
      "processing_time_ms": 5432,
      "created_at": "2025-07-25T10:30:00.000Z",
      "updated_at": "2025-07-25T10:30:05.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 45,
    "totalPages": 3,
    "hasNext": true,
    "hasPrev": false
  },
  "search": null
}
```

### GET `/api/spec/:id`
Get full details of a specific specification.

**Parameters**:
- `id`: Integer, specification ID

**Response** (200):
```json
{
  "id": 123,
  "userInput": "Create a mobile app...",
  "generatedSpec": "# Product Development Specification...",
  "status": "completed",
  "processingTime": 5432,
  "createdAt": "2025-07-25T10:30:00.000Z",
  "updatedAt": "2025-07-25T10:30:05.000Z"
}
```

### GET `/api/download/:id`
Download specification as a formatted Markdown file.

**Parameters**:
- `id`: Integer, specification ID

**Response**: Markdown file download with proper headers

### DELETE `/api/history/:id`
Delete a specific history entry.

**Parameters**:
- `id`: Integer, specification ID

**Response** (200):
```json
{
  "message": "Entry deleted successfully",
  "id": 123
}
```

### GET `/api/health`
Health check and system status.

**Response** (200):
```json
{
  "status": "OK",
  "timestamp": "2025-07-25T10:30:00.000Z",
  "services": {
    "database": "connected",
    "geminiCLI": "available"
  },
  "version": "1.0.0",
  "environment": "development"
}
```

### GET `/api/docs`
API documentation and endpoint information.

## 🔒 Security Features

- **Helmet.js**: Security headers including CSP, HSTS, and more
- **CORS**: Configurable cross-origin resource sharing
- **Rate Limiting**: Protects against abuse with configurable limits
- **Input Validation**: Prevents injection attacks and validates all inputs
- **SQL Injection Protection**: Parameterized queries for all database operations
- **Error Information Disclosure**: Limited error details in production

## 📊 Database Schema

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

-- Indexes for performance
CREATE INDEX idx_ideas_created_at ON ideas(created_at DESC);
CREATE INDEX idx_ideas_status ON ideas(status);
```

## 🧪 Testing

Run the comprehensive test suite:

```bash
# Functional API tests
node test-api.js

# Load testing
node test-api.js --load

# Custom load test (10 concurrent, 50 requests)
node test-api.js --load=10,50

# Show usage examples
node test-api.js --examples

# Help
node test-api.js --help
```

## 📈 Performance Considerations

- **Connection Pooling**: Database connections are managed efficiently
- **Timeout Handling**: Gemini CLI calls have configurable timeouts
- **Retry Logic**: Failed generations are retried with exponential backoff
- **Compression**: Response compression for better performance
- **Caching Headers**: Appropriate cache headers for static content

## 🔧 Configuration

### Rate Limiting
```javascript
// General API rate limiting
windowMs: 15 * 60 * 1000,  // 15 minutes
max: 100,                   // requests per window

// Generate endpoint specific
windowMs: 5 * 60 * 1000,   // 5 minutes  
max: 10,                   // requests per window
```

### Gemini CLI Options
```javascript
{
  timeout: 120000,    // 2 minutes timeout
  maxRetries: 2,      // retry failed attempts
  retryDelay: 1000    // delay between retries
}
```

## 🚨 Error Handling

All endpoints return consistent error responses:

```json
{
  "error": "Error message",
  "timestamp": "2025-07-25T10:30:00.000Z",
  "path": "/api/generate",
  "method": "POST",
  "details": "Additional details (development only)"
}
```

Common HTTP status codes:
- `200`: Success
- `400`: Validation error or bad request
- `404`: Resource not found
- `429`: Rate limit exceeded
- `500`: Internal server error
- `503`: Service unavailable (Gemini CLI issues)

## 📝 Logging

The application provides comprehensive logging:

- **Request Logging**: All incoming requests with timing
- **Error Logging**: Detailed error information
- **Performance Logging**: Generation times and performance metrics
- **Security Logging**: Rate limiting and validation failures

## 🔄 Development Workflow

1. **Start development server**:
   ```bash
   npm run dev
   ```

2. **Run tests**:
   ```bash
   node test-api.js
   ```

3. **Check API health**:
   ```bash
   curl http://localhost:3001/api/health
   ```

4. **Generate a specification**:
   ```bash
   curl -X POST http://localhost:3001/api/generate \
     -H "Content-Type: application/json" \
     -d '{"idea": "Your brilliant idea here that meets minimum length requirements"}'
   ```

## 🛡️ Production Deployment

Before deploying to production:

1. Set `NODE_ENV=production`
2. Configure proper CORS origins
3. Set up proper database credentials
4. Configure reverse proxy (nginx) for SSL termination
5. Set up monitoring and alerting
6. Configure log aggregation
7. Test Gemini CLI availability on production server

## 🤝 Contributing

1. Follow the existing code style
2. Add tests for new features
3. Update documentation
4. Ensure all tests pass
5. Follow semantic versioning

## 📄 License

MIT License - see LICENSE file for details.

---

*Built with Express.js, Turso Database, and Gemini CLI integration*