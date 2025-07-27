import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';
import compression from 'compression';
import { body, param, query, validationResult } from 'express-validator';
import Joi from 'joi';
import { spawn, exec, execSync } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import dotenv from 'dotenv';
import { createClient } from '@libsql/client';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import pino from 'pino';
import statusMonitor from 'express-status-monitor';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Enhanced logging setup
const logger = pino({
  level: NODE_ENV === 'development' ? 'debug' : 'info',
  transport: NODE_ENV === 'development' ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname'
    }
  } : undefined
});

// Socket.IO setup for real-time communication
const io = new SocketIOServer(server, {
  cors: {
    origin: NODE_ENV === 'development' 
      ? ['http://localhost:3000', 'http://localhost:5173'] 
      : process.env.ALLOWED_ORIGINS?.split(',') || false,
    credentials: true
  },
  transports: ['websocket', 'polling']
});

// Connection tracking
const activeConnections = new Map();
const processingJobs = new Map();

// Socket.IO event handlers
io.on('connection', (socket) => {
  logger.info({ socketId: socket.id }, 'WebSocket client connected');
  activeConnections.set(socket.id, socket);
  
  // Handle job subscription
  socket.on('subscribe-job', (jobId) => {
    if (typeof jobId === 'string' && jobId.length > 0) {
      socket.join(`job-${jobId}`);
      logger.debug({ socketId: socket.id, jobId }, 'Client subscribed to job updates');
    }
  });
  
  // Handle job unsubscription
  socket.on('unsubscribe-job', (jobId) => {
    if (typeof jobId === 'string' && jobId.length > 0) {
      socket.leave(`job-${jobId}`);
      logger.debug({ socketId: socket.id, jobId }, 'Client unsubscribed from job updates');
    }
  });
  
  // Handle disconnection
  socket.on('disconnect', (reason) => {
    logger.info({ socketId: socket.id, reason }, 'WebSocket client disconnected');
    activeConnections.delete(socket.id);
  });
  
  // Handle connection errors
  socket.on('error', (error) => {
    logger.error({ socketId: socket.id, error }, 'WebSocket error');
  });
});

// Helper function to emit job updates
const emitJobUpdate = (jobId, status, data = {}) => {
  io.to(`job-${jobId}`).emit('job-update', {
    jobId,
    status,
    timestamp: new Date().toISOString(),
    ...data
  });
};

// Enhanced error handling and status messages for Gemini CLI integration
function getGeminiErrorMessage(error) {
  if (error.message.includes('timeout')) {
    return 'Gemini CLI 請求超時。這可能是因為：1) API 金鑰未配置 2) 網路連接問題 3) 請求過於複雜。請檢查 Gemini API 配置。';
  } else if (error.message.includes('Failed to start')) {
    return 'Gemini CLI 未安裝或不在系統 PATH 中。請確認已正確安裝 @google/gemini-cli。';
  } else if (error.message.includes('failed with code')) {
    return 'Gemini CLI 執行失敗。請檢查：1) API 金鑰是否配置 2) 網路連接 3) API 配額限制。';
  } else if (error.message.includes('null')) {
    return 'Gemini CLI 可能因 API 配置問題而終止。請確認已設置有效的 Google AI API 金鑰。';
  }
  return `Gemini CLI 錯誤: ${error.message}。請檢查 API 配置和網路連接。`;
}

// Database setup
const dbPath = path.join(__dirname, '..', 'database', 'local.db');

const db = createClient({
  url: process.env.TURSO_DATABASE_URL || `file:${dbPath}`,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// Validation schemas
const schemas = {
  generateIdea: Joi.object({
    idea: Joi.string().min(10).max(5000).required().messages({
      'string.min': 'Idea must be at least 10 characters long',
      'string.max': 'Idea cannot exceed 5000 characters',
      'any.required': 'Idea is required'
    })
  }),
  
  historyQuery: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    search: Joi.string().max(200).optional()
  })
};

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: NODE_ENV === 'development' ? 1000 : 100, // Higher limit in development
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const generateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: NODE_ENV === 'development' ? 100 : 10, // Lower limit for generate endpoint
  message: {
    error: 'Too many generation requests, please try again later.',
    retryAfter: '5 minutes'
  }
});

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// CORS configuration
app.use(cors({
  origin: NODE_ENV === 'development' 
    ? ['http://localhost:3000', 'http://localhost:5173'] 
    : process.env.ALLOWED_ORIGINS?.split(',') || false,
  credentials: true,
  optionsSuccessStatus: 200
}));

// General middleware
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(limiter);

// Status monitoring
app.use(statusMonitor({
  title: 'Idea-to-Specs Status Monitor',
  path: '/status',
  spans: [
    { interval: 1, retention: 60 },    // Every second for last minute
    { interval: 5, retention: 60 },    // Every 5 seconds for last 5 minutes  
    { interval: 15, retention: 40 }    // Every 15 seconds for last 10 minutes
  ],
  chartVisibility: {
    cpu: true,
    mem: true,
    load: true,
    heap: true,
    responseTime: true,
    rps: true,
    statusCodes: true
  },
  healthChecks: [{
    protocol: 'http',
    host: 'localhost',
    path: '/api/health',
    port: PORT
  }]
}));

// Logging middleware
if (NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Custom logging middleware
app.use((req, res, next) => {
  const startTime = Date.now();
  const originalSend = res.send;
  
  res.send = function(data) {
    const duration = Date.now() - startTime;
    const logData = {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      responseSize: Buffer.byteLength(typeof data === 'string' ? data : JSON.stringify(data))
    };
    
    if (res.statusCode >= 400) {
      logger.error(logData, 'HTTP Error Response');
    } else {
      logger.info(logData, 'HTTP Request');
    }
    
    // Log performance metrics to database (async, don't wait)
    if (req.path.startsWith('/api/')) {
      logPerformanceMetric(
        req.path,
        req.method,
        duration,
        res.statusCode,
        res.statusCode >= 400 ? data : null
      ).catch(err => {
        logger.debug({ error: err }, 'Failed to log performance metric');
      });
    }
    
    originalSend.call(this, data);
  };
  
  next();
});

// Input validation middleware
const validateRequest = (schema) => {
  return (req, res, next) => {
    const dataToValidate = req.method === 'GET' ? req.query : req.body;
    const { error, value } = schema.validate(dataToValidate, { 
      abortEarly: false,
      stripUnknown: true 
    });
    
    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        timestamp: new Date().toISOString(),
        details: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message
        }))
      });
    }
    
    req.validatedData = value;
    next();
  };
};

// Error handling middleware
const errorHandler = (err, req, res, next) => {
  console.error(`Error in ${req.method} ${req.path}:`, err);
  
  // Default error response
  let statusCode = 500;
  let message = 'Internal server error';
  let details = null;
  
  // Handle specific error types
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation error';
    details = err.message;
  } else if (err.code === 'ENOENT') {
    statusCode = 404;
    message = 'Resource not found';
  } else if (err.code === 'ECONNREFUSED') {
    statusCode = 503;
    message = 'Service unavailable';
  }
  
  const errorResponse = {
    error: message,
    timestamp: new Date().toISOString(),
    path: req.path,
    method: req.method
  };
  
  if (NODE_ENV === 'development' && details) {
    errorResponse.details = details;
  }
  
  res.status(statusCode).json(errorResponse);
};

// Initialize database with enhanced schema
async function initDatabase() {
  try {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS ideas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_input TEXT NOT NULL,
        generated_spec TEXT NOT NULL,
        status TEXT DEFAULT 'completed' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
        processing_time_ms INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create performance metrics table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS performance_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        endpoint TEXT NOT NULL,
        method TEXT NOT NULL,
        duration_ms INTEGER NOT NULL,
        status_code INTEGER NOT NULL,
        error_message TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create indexes for better performance
    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_ideas_created_at ON ideas(created_at DESC)
    `);
    
    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_ideas_status ON ideas(status)
    `);
    
    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_performance_created_at ON performance_metrics(created_at DESC)
    `);
    
    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_performance_endpoint ON performance_metrics(endpoint)
    `);
    
    console.log('Database initialized successfully with enhanced schema');
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  }
}

// Performance logging function
async function logPerformanceMetric(path, method, duration, statusCode, error = null) {
  try {
    await db.execute({
      sql: `
        INSERT INTO performance_metrics (
          endpoint, method, duration_ms, status_code, error_message
        ) VALUES (?, ?, ?, ?, ?)
      `,
      args: [path, method, duration, statusCode, error ? JSON.stringify(error) : null]
    });
  } catch (err) {
    // Don't throw - performance logging shouldn't break the app
    logger.debug({ error: err }, 'Failed to log performance metric');
  }
}

// Database maintenance function
async function performDatabaseMaintenance() {
  try {
    // Simple maintenance tasks
    await db.execute('VACUUM'); // Optimize database
    logger.info('Database maintenance completed');
  } catch (error) {
    logger.error({ error }, 'Database maintenance failed');
  }
}

// Enhanced Gemini CLI integration with timeout, retry, and better error handling
async function generateSpecWithGemini(idea, options = {}) {
  const {
    timeout = 180000, // 3 minutes timeout for complex generation
    maxRetries = 2,
    retryDelay = 1000,
    jobId = null // For WebSocket updates
  } = options;

  const attemptGeneration = (attemptNumber = 1) => {
    return new Promise((resolve, reject) => {
      console.log(`🔄 Gemini CLI attempt ${attemptNumber}/${maxRetries + 1} for idea: ${idea.substring(0, 100)}...`);
      
      if (jobId) {
        emitJobUpdate(jobId, 'processing', { 
          message: `嘗試 ${attemptNumber}/${maxRetries + 1}: 正在調用 Gemini CLI...`,
          attempt: attemptNumber
        });
      }
      
      const startTime = Date.now();
      // 簡化 prompt 並增加成功率
      const prompt = `請為「${idea}」製作一份軟體開發規格。包含：專案概述、功能需求、技術架構、開發階段。用Markdown格式，繁體中文回答。`;

      // 保留完整的使用者環境，但不使用 shell 避免參數解析問題
      const env = {
        ...process.env,
        HOME: os.homedir(),
        USER: os.userInfo().username,
        // 保留 Google OAuth 相關環境變數
        GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS,
        PATH: process.env.PATH,
      };
      
      // 驗證 Gemini CLI 路徑
      let geminiPath = 'unknown';
      try {
        geminiPath = execSync('which gemini').toString().trim();
        logger.info('Gemini CLI path verified:', geminiPath);
      } catch (error) {
        logger.warn('Gemini CLI path not found in PATH, will attempt direct execution');
      }
      
      // 添加詳細的錯誤日誌
      logger.info('Gemini CLI command preparation:', {
        command: 'gemini',
        geminiPath,
        args: ['-p', '<<prompt>>'],
        promptLength: prompt.length,
        env: { 
          HOME: env.HOME, 
          USER: env.USER,
          hasGoogleCreds: !!env.GOOGLE_APPLICATION_CREDENTIALS 
        },
        cwd: os.homedir()
      });
      
      // 方法 2：使用 stdin 管道方式，避免參數解析問題
      const geminiProcess = spawn('gemini', ['-p'], {
        env,
        cwd: os.homedir(), // 使用使用者 home 目錄作為工作目錄
        stdio: ['pipe', 'pipe', 'pipe'],
        uid: process.getuid?.(), // 保持相同的使用者 ID
        gid: process.getgid?.(), // 保持相同的群組 ID
      });
      
      // 將 prompt 寫入 stdin
      geminiProcess.stdin.write(prompt);
      geminiProcess.stdin.end();

      logger.info('Gemini CLI process started with OAuth context', {
        cwd: os.homedir(),
        user: os.userInfo().username,
        hasGoogleCreds: !!process.env.GOOGLE_APPLICATION_CREDENTIALS,
        shellMode: true
      });

      let output = '';
      let error = '';
      let timeoutId;
      let isCompleted = false;

      // Set up timeout
      timeoutId = setTimeout(() => {
        if (!isCompleted) {
          isCompleted = true;
          geminiProcess.kill('SIGTERM');
          reject(new Error(`Gemini CLI timeout after ${timeout}ms`));
        }
      }, timeout);

      geminiProcess.stdout.on('data', (data) => {
        output += data.toString();
        // Emit progress update for real-time feedback
        if (jobId) {
          emitJobUpdate(jobId, 'processing', { 
            message: `正在接收 Gemini 回應... (${Math.floor(output.length / 1024)}KB)`,
            dataReceived: Number(output.length)
          });
        }
      });

      geminiProcess.stderr.on('data', (data) => {
        error += data.toString();
        logger.warn('Gemini stderr chunk:', data.toString());
      });

      geminiProcess.on('close', (code) => {
        if (!isCompleted) {
          isCompleted = true;
          clearTimeout(timeoutId);
          const duration = Date.now() - startTime;
          
          if (code === 0) {
            console.log(`✅ Gemini CLI completed successfully in ${duration}ms`);
            if (jobId) {
              emitJobUpdate(jobId, 'processing', { 
                message: '✅ Gemini CLI 調用成功，正在處理回應...',
                duration: Number(duration),
                outputLength: Number(output.length)
              });
            }
            resolve({
              output: output.trim(),
              duration: Number(duration),
              attempt: Number(attemptNumber),
              outputLength: Number(output.length)
            });
        } else {
            const errorMsg = `Gemini CLI failed with code ${code}: ${error}`;
            logger.error('Gemini CLI execution failed:', { 
              code, 
              error: error,
              promptLength: prompt.length,
              duration,
              geminiPath
            });
            reject(new Error(errorMsg));
          }
        }
      });

      geminiProcess.on('error', (err) => {
        if (!isCompleted) {
          isCompleted = true;
          clearTimeout(timeoutId);
          const errorMsg = `Failed to start Gemini CLI: ${err.message}`;
          logger.error('Gemini CLI process error:', { 
            error: err.message,
            code: err.code,
            errno: err.errno,
            geminiPath,
            env: { HOME: env.HOME, USER: env.USER }
          });
          reject(new Error(errorMsg));
        }
      });
    });
  };

  // Retry logic with enhanced logging
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      const result = await attemptGeneration(attempt);
      console.log(`🎉 Gemini CLI succeeded on attempt ${attempt}`);
      return result;
    } catch (error) {
      console.error(`❌ Gemini CLI attempt ${attempt} failed:`, error.message);
      
      if (attempt === maxRetries + 1) {
        console.error(`💥 All ${maxRetries + 1} attempts failed`);
        throw new Error(`Gemini CLI failed after ${maxRetries + 1} attempts: ${error.message}`);
      }
      
      console.log(`⏳ Waiting ${retryDelay * attempt}ms before retry ${attempt + 1}...`);
      if (jobId) {
        emitJobUpdate(jobId, 'processing', { 
          message: `嘗試 ${attempt} 失敗，${retryDelay * attempt / 1000} 秒後重試...`,
          error: error.message
        });
      }
      
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
    }
  }
}

// Format generated specification for better markdown output
function formatSpecification(rawSpec, userInput) {
  const timestamp = new Date().toISOString();
  const formattedSpec = `# Product Development Specification

**Generated:** ${timestamp}
**Original Idea:** ${userInput}

---

${rawSpec}

---

*Generated using Gemini CLI integration*`;
  
  return formattedSpec;
}

// API Routes

// Generate specification from idea
app.post('/api/generate', 
  generateLimiter,
  validateRequest(schemas.generateIdea),
  async (req, res, next) => {
    const startTime = Date.now();
    let recordId = null;
    
    try {
      console.log('Debug - req.body:', req.body);
      console.log('Debug - req.validatedData:', req.validatedData);
      
      const { idea } = req.validatedData || req.body;
      
      console.log(`Starting spec generation for idea: ${idea ? idea.substring(0, 100) : 'NULL'}...`);
      console.log('Debug - idea value:', idea);
      console.log('Debug - idea type:', typeof idea);
      console.log('Debug - idea length:', idea ? idea.length : 'N/A');
      
      if (!idea) {
        throw new Error('Idea is null or undefined');
      }
      
      // Create initial database record with pending status
      const initialResult = await db.execute({
        sql: 'INSERT INTO ideas (user_input, generated_spec, status) VALUES (?, ?, ?)',
        args: [idea, '', 'processing']
      });
      
      recordId = initialResult.lastInsertRowid;
      const jobId = `job-${recordId}-${Date.now()}`;
      
      // Generate spec using Gemini CLI only - no fallback
      console.log('🚀 Generating specification using Gemini CLI...');
      emitJobUpdate(jobId, 'processing', { message: 'Calling Gemini CLI...' });
      
      const result = await generateSpecWithGemini(idea, {
        timeout: 120000, // 2 minutes timeout for Gemini CLI
        maxRetries: 2,   // Increased retries for better reliability
        retryDelay: 2000, // Increased delay between retries
        jobId: jobId    // Pass job ID for WebSocket updates
      });
      
      console.log('✅ Successfully generated spec using Gemini CLI');
      emitJobUpdate(jobId, 'processing', { message: 'Formatting specification...' });
      
      const formattedSpec = formatSpecification(result.output, idea);
      const totalDuration = Date.now() - startTime;
      
      // Update database record with results
      await db.execute({
        sql: 'UPDATE ideas SET generated_spec = ?, status = ?, processing_time_ms = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        args: [formattedSpec, 'completed', totalDuration, recordId]
      });
      
      console.log(`Spec generation completed in ${totalDuration}ms (Gemini: ${result.duration}ms)`);
      
      // Emit successful completion via WebSocket
      emitJobUpdate(jobId, 'completed', { 
        message: '🎉 規格文檔生成完成！',
        totalDuration: Number(totalDuration),
        geminiDuration: Number(result.duration),
        outputLength: Number(formattedSpec.length),
        attempt: Number(result.attempt)
      });
      
      res.json({
        id: Number(recordId),
        userInput: idea,
        generatedSpec: formattedSpec,
        status: 'completed',
        processingTime: Number(totalDuration),
        geminiDuration: Number(result.duration),
        attempt: Number(result.attempt),
        outputLength: Number(formattedSpec.length),
        createdAt: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('Error generating spec:', error);
      console.error('Error stack:', error.stack);
      
      // Emit failure update via WebSocket
      const jobId = recordId ? `job-${recordId}-${Date.now()}` : 'unknown';
      emitJobUpdate(jobId, 'failed', { 
        message: getGeminiErrorMessage(error),
        error: error.message 
      });
      
      // Update database record with failure status if record was created
      if (recordId) {
        try {
          await db.execute({
            sql: 'UPDATE ideas SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            args: ['failed', recordId]
          });
        } catch (dbError) {
          console.error('Error updating failed record:', dbError);
        }
      }
      
      // Return user-friendly error response
      const userMessage = getGeminiErrorMessage(error);
      res.status(500).json({
        error: 'Specification generation failed',
        message: userMessage,
        timestamp: new Date().toISOString(),
        path: req.path,
        method: req.method,
        suggestions: [
          '檢查 Gemini CLI 是否正確安裝和配置',
          '確認網路連接正常',
          '稍後再試或聯繫系統管理員'
        ],
        details: NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }
);

// Simple test endpoint without validation
app.get('/api/history-test', async (req, res) => {
  try {
    console.log('Simple history test...');
    const result = await db.execute('SELECT * FROM ideas LIMIT 2');
    console.log('Full result:', result);
    
    // Map to objects
    const data = result.rows.map(row => {
      const item = {};
      result.columns.forEach((col, index) => {
        item[col] = row[index];
      });
      return item;
    });
    
    res.json({ columns: result.columns, rawRows: result.rows, mappedData: data });
  } catch (error) {
    console.error('Simple test error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get history with pagination and search
app.get('/api/history', 
  validateRequest(schemas.historyQuery),
  async (req, res, next) => {
    try {
      console.log('History API - validatedData:', req.validatedData);
      const { page = 1, limit = 20, search = '' } = req.validatedData || req.query;
      const offset = (page - 1) * limit;
      
      console.log('History API - parsed params:', { page, limit, search, offset });
      
      // Ensure parameters are numbers
      const limitNum = parseInt(limit, 10);
      const offsetNum = parseInt(offset, 10);
      
      console.log('History API - executing count query...');
      // First, try a simple count query to test database connection
      const countResult = await db.execute('SELECT COUNT(*) as total FROM ideas');
      console.log('History API - count result:', countResult);
      // libsql returns rows as objects, use the alias 'total'
      const total = countResult.rows?.[0]?.total || 0;
      
      // If there are no rows, return empty result
      if (total === 0) {
        return res.json({
          data: [],
          pagination: {
            page,
            limit: limitNum,
            total: 0,
            totalPages: 0,
            hasNext: false,
            hasPrev: false
          },
          search: search || null
        });
      }
      
      // Simple query for data
      let query = 'SELECT id, user_input, generated_spec, status, processing_time_ms, created_at, updated_at FROM ideas';
      let queryParams = [];
      
      // Add search functionality
      if (search) {
        query += ' WHERE user_input LIKE ? OR generated_spec LIKE ?';
        const searchParam = `%${search}%`;
        queryParams.push(searchParam, searchParam);
      }
      
      // Add ordering and pagination
      query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
      queryParams.push(limitNum, offsetNum);
      
      // Execute query
      const dataResult = await db.execute({
        sql: query,
        args: queryParams
      });
      console.log('History API - data result:', { columns: dataResult.columns, rowCount: dataResult.rows?.length });
      
      // Process data to create preview - data is already in object format
      const processedData = dataResult.rows.map(row => ({
        ...row,
        preview: row.generated_spec ? row.generated_spec.substring(0, 200) : ''
      }));
      
      const totalPages = Math.ceil(total / limitNum);
      
      res.json({
        data: processedData,
        pagination: {
          page,
          limit: limitNum,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1
        },
        search: search || null
      });
      
    } catch (error) {
      console.error('Error fetching history:', error);
      next(error);
    }
  }
);

// Download specification as Markdown with improved formatting
app.get('/api/download/:id', 
  param('id').isInt({ min: 1 }).withMessage('Invalid ID'),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        timestamp: new Date().toISOString(),
        details: errors.array()
      });
    }
    next();
  },
  async (req, res, next) => {
    try {
      const { id } = req.params;
      
      const result = await db.execute({
        sql: 'SELECT * FROM ideas WHERE id = ?',
        args: [id]
      });
      
      if (result.rows.length === 0) {
        return res.status(404).json({ 
          error: 'Specification not found',
          timestamp: new Date().toISOString(),
          id: parseInt(id)
        });
      }
      
      const spec = result.rows[0];
      
      // Ensure the spec is properly formatted
      let formattedContent = spec.generated_spec;
      if (!formattedContent.includes('# Product Development Specification')) {
        formattedContent = formatSpecification(formattedContent, spec.user_input);
      }
      
      // Generate a descriptive filename
      const ideaPreview = spec.user_input
        .substring(0, 50)
        .replace(/[^a-zA-Z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .toLowerCase();
      
      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `spec-${ideaPreview}-${timestamp}-${id}.md`;
      
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', Buffer.byteLength(formattedContent, 'utf8'));
      res.send(formattedContent);
      
      console.log(`Downloaded specification ${id} as ${filename}`);
      
    } catch (error) {
      console.error('Error downloading spec:', error);
      next(error);
    }
  }
);

// Get specific specification by ID
app.get('/api/spec/:id',
  param('id').isInt({ min: 1 }).withMessage('Invalid ID'),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        timestamp: new Date().toISOString(),
        details: errors.array()
      });
    }
    next();
  },
  async (req, res, next) => {
    try {
      const { id } = req.params;
      
      const result = await db.execute({
        sql: 'SELECT * FROM ideas WHERE id = ?',
        args: [id]
      });
      
      if (result.rows.length === 0) {
        return res.status(404).json({ 
          error: 'Specification not found',
          timestamp: new Date().toISOString(),
          id: parseInt(id)
        });
      }
      
      const spec = result.rows[0];
      res.json({
        id: spec.id,
        userInput: spec.user_input,
        generatedSpec: spec.generated_spec,
        status: spec.status,
        processingTime: spec.processing_time_ms,
        createdAt: spec.created_at,
        updatedAt: spec.updated_at
      });
      
    } catch (error) {
      console.error('Error fetching specification:', error);
      next(error);
    }
  }
);

// Delete specific entry with confirmation
app.delete('/api/history/:id', 
  param('id').isInt({ min: 1 }).withMessage('Invalid ID'),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        timestamp: new Date().toISOString(),
        details: errors.array()
      });
    }
    next();
  },
  async (req, res, next) => {
    try {
      const { id } = req.params;
      
      // First check if the entry exists
      const checkResult = await db.execute({
        sql: 'SELECT id FROM ideas WHERE id = ?',
        args: [id]
      });
      
      if (checkResult.rows.length === 0) {
        return res.status(404).json({ 
          error: 'Entry not found',
          timestamp: new Date().toISOString(),
          id: parseInt(id)
        });
      }
      
      // Delete the entry
      await db.execute({
        sql: 'DELETE FROM ideas WHERE id = ?',
        args: [id]
      });
      
      console.log(`Deleted specification entry ${id}`);
      res.json({ 
        message: 'Entry deleted successfully',
        id: parseInt(id)
      });
      
    } catch (error) {
      console.error('Error deleting entry:', error);
      next(error);
    }
  }
);

// Health check with system information
app.get('/api/health', async (req, res) => {
  try {
    // Test database connection
    await db.execute('SELECT 1');
    
    // Test Gemini CLI availability with enhanced diagnostics
    let geminiStatus = {
      available: false,
      configured: false,
      error: null
    };
    
    try {
      // Test if Gemini CLI is installed
      await new Promise((resolve, reject) => {
        const testProcess = spawn('gemini', ['--version'], { timeout: 5000 });
        testProcess.on('close', (code) => {
          if (code === 0) {
            geminiStatus.available = true;
            // Test if it can handle a simple prompt (indicates API configuration)
            testGeminiConfiguration().then(configured => {
              geminiStatus.configured = configured;
              resolve();
            });
          } else {
            geminiStatus.error = `Version check failed with code ${code}`;
            resolve();
          }
        });
        testProcess.on('error', (err) => {
          geminiStatus.error = `Not installed: ${err.message}`;
          resolve();
        });
      });
    } catch (error) {
      geminiStatus.error = error.message;
    }
    
    async function testGeminiConfiguration() {
      return new Promise((resolve) => {
        const configTest = spawn('gemini', ['-p', 'Test configuration'], { 
          timeout: 8000,
          stdio: ['pipe', 'pipe', 'pipe']
        });
        
        let hasOutput = false;
        let stdout = '';
        let stderr = '';
        
        configTest.stdout.on('data', (data) => {
          stdout += data.toString();
          hasOutput = true;
        });
        
        configTest.stderr.on('data', (data) => {
          stderr += data.toString();
        });
        
        configTest.on('close', (code) => {
          // Configuration is good if we get output and no API key errors
          const isConfigured = code === 0 && hasOutput && 
                              !stderr.includes('API_KEY') && 
                              !stderr.includes('api_key') &&
                              !stderr.includes('GOOGLE_API_KEY') &&
                              stdout.length > 10; // Meaningful response
          resolve(isConfigured);
        });
        
        configTest.on('error', () => resolve(false));
        
        setTimeout(() => {
          if (!configTest.killed) {
            configTest.kill('SIGTERM');
            resolve(false);
          }
        }, 8000);
      });
    }
    
    // Get system statistics
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    const uptime = process.uptime();
    
    res.json({ 
      status: 'OK', 
      timestamp: new Date().toISOString(),
      services: {
        database: 'connected',
        geminiCLI: {
          status: geminiStatus.available ? 
            (geminiStatus.configured ? 'ready' : 'installed_but_not_configured') : 
            'unavailable',
          available: geminiStatus.available,
          configured: geminiStatus.configured,
          error: geminiStatus.error
        }
      },
      version: '1.0.0',
      environment: NODE_ENV,
      uptime: Math.floor(uptime),
      memory: {
        rss: memUsage.rss,
        heapTotal: memUsage.heapTotal,
        heapUsed: memUsage.heapUsed,
        external: memUsage.external
      },
      cpu: {
        user: cpuUsage.user,
        system: cpuUsage.system
      },
      statistics: {
        activeConnections: (server.engine ? server.engine.clientsCount : 0) || 0,
        totalRequests: 0, // This would need to be tracked in production
        averageResponseTime: 0 // This would need to be calculated from logs
      }
    });
  } catch (error) {
    res.status(503).json({
      status: 'ERROR',
      timestamp: new Date().toISOString(),
      error: 'Service health check failed',
      details: NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Gemini CLI specific health check
app.get('/api/gemini/health', async (req, res) => {
  try {
    let geminiStatus = 'unavailable';
    let version = null;
    let latency = 0;
    
    const startTime = Date.now();
    
    await new Promise((resolve, reject) => {
      const testProcess = spawn('gemini', ['--version'], { 
        timeout: 10000,
        stdio: ['ignore', 'pipe', 'pipe']
      });
      
      let output = '';
      
      testProcess.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      testProcess.on('close', (code) => {
        latency = Date.now() - startTime;
        if (code === 0) {
          geminiStatus = 'available';
          version = output.trim();
        }
        resolve();
      });
      
      testProcess.on('error', () => {
        latency = Date.now() - startTime;
        resolve();
      });
    });
    
    const responseStatus = geminiStatus === 'available' ? 200 : 503;
    
    res.status(responseStatus).json({
      service: 'Gemini CLI',
      status: geminiStatus,
      version: version,
      latency: `${latency}ms`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      service: 'Gemini CLI',
      status: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Gemini CLI authentication status endpoint (simplified for CLI v0.1.1)
app.get('/api/gemini/auth-status', async (req, res) => {
  try {
    // 這個版本的 Gemini CLI (0.1.1) 不支持 auth 命令
    // 我們通過測試簡單調用來檢查是否可用（使用與實際成功的方法一致）
    const authCheck = await new Promise((resolve) => {
      const testProcess = spawn('gemini', ['-p'], {
        env: { ...process.env, HOME: os.homedir() },
        cwd: os.homedir(),
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      let output = '';
      let error = '';
      
      // 發送簡單測試 prompt
      testProcess.stdin.write('hi');
      testProcess.stdin.end();
      
      testProcess.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      testProcess.stderr.on('data', (data) => {
        error += data.toString();
      });
      
      const timeoutId = setTimeout(() => {
        testProcess.kill('SIGTERM');
        resolve({ authenticated: false, error: 'Test timeout' });
      }, 10000);
      
      testProcess.on('close', (code) => {
        clearTimeout(timeoutId);
        if (code === 0 && output.length > 0) {
          logger.info('Gemini CLI test successful');
          resolve({ authenticated: true, output: 'Gemini CLI responding normally' });
        } else {
          logger.warn('Gemini CLI test failed:', { code, error });
          resolve({ authenticated: false, error: error || `Process exited with code ${code}` });
        }
      });
      
      testProcess.on('error', (err) => {
        clearTimeout(timeoutId);
        resolve({ authenticated: false, error: err.message });
      });
    });
    
    res.json({
      service: 'Gemini CLI v0.1.1',
      authenticated: authCheck.authenticated,
      output: authCheck.output,
      error: authCheck.error,
      timestamp: new Date().toISOString(),
      note: 'This version does not support auth status command, tested with simple call'
    });
  } catch (error) {
    logger.error('Failed to test Gemini CLI:', error);
    res.status(500).json({ 
      service: 'Gemini CLI v0.1.1',
      authenticated: false,
      error: 'Failed to test CLI availability',
      timestamp: new Date().toISOString()
    });
  }
});

// API documentation endpoint
app.get('/api/docs', (req, res) => {
  res.json({
    title: 'Idea-to-Specifications API',
    version: '1.0.0',
    endpoints: {
      'POST /api/generate': {
        description: 'Generate specification from idea using Gemini CLI',
        body: { idea: 'string (10-5000 chars)' },
        rateLimit: '10 requests per 5 minutes'
      },
      'GET /api/history': {
        description: 'Get paginated history with optional search',
        query: {
          page: 'number (default: 1)',
          limit: 'number (1-100, default: 20)',
          search: 'string (optional)'
        }
      },
      'GET /api/spec/:id': {
        description: 'Get specific specification by ID',
        params: { id: 'integer' }
      },
      'GET /api/download/:id': {
        description: 'Download specification as Markdown file',
        params: { id: 'integer' }
      },
      'DELETE /api/history/:id': {
        description: 'Delete specific history entry',
        params: { id: 'integer' }
      },
      'GET /api/health': {
        description: 'Health check and system status'
      },
      'GET /api/gemini/health': {
        description: 'Gemini CLI service health check'
      },
      'GET /status': {
        description: 'Status monitoring dashboard'
      }
    },
    websocketEvents: {
      'connection': 'Client connects to WebSocket',
      'subscribe-job': 'Subscribe to job updates',
      'unsubscribe-job': 'Unsubscribe from job updates',
      'job-update': 'Receive real-time job status updates',
      'disconnect': 'Client disconnects'
    },
    jobStatuses: ['started', 'processing', 'completed', 'failed']
  });
});

// Apply error handling middleware
app.use(errorHandler);

// 404 handler for unmatched routes
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    timestamp: new Date().toISOString(),
    path: req.originalUrl,
    method: req.method,
    availableEndpoints: [
      'POST /api/generate',
      'GET /api/history',
      'GET /api/spec/:id',
      'GET /api/download/:id',
      'DELETE /api/history/:id',
      'GET /api/health',
      'GET /api/docs'
    ]
  });
});

// Enhanced graceful shutdown handling
const gracefulShutdown = (signal) => {
  logger.info({ signal }, 'Received shutdown signal, closing server gracefully');
  
  // Close HTTP server
  server.close(() => {
    logger.info('HTTP server closed');
    
    // Close Socket.IO connections
    io.close(() => {
      logger.info('Socket.IO server closed');
      
      // Close database connections
      try {
        // Note: libsql client doesn't have explicit close method
        logger.info('Database connections cleaned up');
      } catch (error) {
        logger.error({ error }, 'Error closing database connections');
      }
      
      logger.info('Graceful shutdown completed');
      process.exit(0);
    });
  });
  
  // Force close after 30 seconds
  setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 30000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start server with Socket.IO support
server.listen(PORT, '0.0.0.0', async () => {
  try {
    await initDatabase();
    
    logger.info({
      port: PORT,
      environment: NODE_ENV,
      version: '1.0.0'
    }, 'Backend server started successfully');
    
    console.log(`\n🚀 Backend server running on http://localhost:${PORT}`);
    console.log(`📚 API documentation: http://localhost:${PORT}/api/docs`);
    console.log(`❤️  Health check: http://localhost:${PORT}/api/health`);
    console.log(`📊 Status monitor: http://localhost:${PORT}/status`);
    console.log(`🔌 WebSocket support: ws://localhost:${PORT}/socket.io`);
    console.log(`🌍 Environment: ${NODE_ENV}`);
    console.log(`\nAvailable endpoints:`);
    console.log(`  POST   /api/generate        - Generate specification (with WebSocket updates)`);
    console.log(`  GET    /api/history         - Get history (paginated)`);
    console.log(`  GET    /api/spec/:id        - Get specific spec`);
    console.log(`  GET    /api/download/:id     - Download as Markdown`);
    console.log(`  DELETE /api/history/:id     - Delete entry`);
    console.log(`  GET    /api/health          - Comprehensive health check`);
    console.log(`  GET    /api/gemini/health   - Gemini CLI health check`);
    console.log(`  GET    /api/job/:id/status  - Get job status (polling fallback)`);
    console.log(`  GET    /api/docs            - API documentation`);
    console.log(`  GET    /status              - System monitoring dashboard\n`);
    
    // Periodic health checks (commented out until health check functions are implemented)
    // setInterval(async () => {
    //   try {
    //     const dbHealth = await checkDatabaseHealth();
    //     const geminiHealth = await checkGeminiHealth();
    //     
    //     if (dbHealth.status !== 'healthy' || geminiHealth.status !== 'healthy') {
    //       logger.warn({ dbHealth, geminiHealth }, 'Service health degraded');
    //     }
    //   } catch (error) {
    //     logger.error({ error }, 'Periodic health check failed');
    //   }
    // }, 60000); // Check every minute
    
    // Database maintenance scheduling
    setInterval(async () => {
      await performDatabaseMaintenance();
    }, 24 * 60 * 60 * 1000); // Run daily maintenance
    
    // Run initial maintenance after 5 minutes
    setTimeout(async () => {
      await performDatabaseMaintenance();
    }, 5 * 60 * 1000);
    
  } catch (error) {
    logger.error({ error }, 'Failed to start server');
    process.exit(1);
  }
});