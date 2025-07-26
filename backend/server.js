import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';
import compression from 'compression';
import { body, param, query, validationResult } from 'express-validator';
import Joi from 'joi';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
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
const PORT = process.env.PORT || 3002;
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

// Database setup
const db = createClient({
  url: process.env.TURSO_DATABASE_URL || 'file:../database/local.db',
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
    const { error, value } = schema.validate(req.body || req.query, { 
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
    await db.execute(`
      INSERT INTO performance_metrics (
        endpoint, method, duration_ms, status_code, error_message
      ) VALUES (?, ?, ?, ?, ?)
    `, [path, method, duration, statusCode, error ? JSON.stringify(error) : null]);
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
    timeout = 120000, // 2 minutes default timeout
    maxRetries = 2,
    retryDelay = 1000
  } = options;

  const attemptGeneration = (attemptNumber = 1) => {
    return new Promise((resolve, reject) => {
      console.log(`Gemini CLI attempt ${attemptNumber}/${maxRetries + 1} for idea: ${idea.substring(0, 100)}...`);
      
      const startTime = Date.now();
      const geminiProcess = spawn('gemini', ['-P', idea], {
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: timeout
      });

      let output = '';
      let error = '';
      let timeoutId;

      // Set up timeout
      timeoutId = setTimeout(() => {
        geminiProcess.kill('SIGTERM');
        reject(new Error(`Gemini CLI timeout after ${timeout}ms`));
      }, timeout);

      geminiProcess.stdout.on('data', (data) => {
        output += data.toString();
      });

      geminiProcess.stderr.on('data', (data) => {
        error += data.toString();
      });

      geminiProcess.on('close', (code) => {
        clearTimeout(timeoutId);
        const duration = Date.now() - startTime;
        
        if (code === 0) {
          console.log(`Gemini CLI completed successfully in ${duration}ms`);
          resolve({
            output: output.trim(),
            duration,
            attempt: attemptNumber
          });
        } else {
          const errorMsg = `Gemini CLI failed with code ${code}: ${error}`;
          console.error(errorMsg);
          reject(new Error(errorMsg));
        }
      });

      geminiProcess.on('error', (err) => {
        clearTimeout(timeoutId);
        const errorMsg = `Failed to start Gemini CLI: ${err.message}`;
        console.error(errorMsg);
        reject(new Error(errorMsg));
      });
    });
  };

  // Retry logic
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await attemptGeneration(attempt);
    } catch (error) {
      console.error(`Gemini CLI attempt ${attempt} failed:`, error.message);
      
      if (attempt === maxRetries + 1) {
        throw new Error(`Gemini CLI failed after ${maxRetries + 1} attempts: ${error.message}`);
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
      const { idea } = req.validatedData;
      
      console.log(`Starting spec generation for idea: ${idea.substring(0, 100)}...`);
      
      // Create initial database record with pending status
      const initialResult = await db.execute(
        'INSERT INTO ideas (user_input, generated_spec, status) VALUES (?, ?, ?)',
        [idea, '', 'processing']
      );
      
      recordId = initialResult.lastInsertRowid;
      
      // Generate spec using Gemini CLI with enhanced options
      const result = await generateSpecWithGemini(idea, {
        timeout: 120000, // 2 minutes
        maxRetries: 2,
        retryDelay: 1000
      });
      
      const formattedSpec = formatSpecification(result.output, idea, {
      duration: result.duration,
      attempt: result.attempt,
      outputLength: result.outputLength,
      jobId
    });
      const totalDuration = Date.now() - startTime;
      
      // Update database record with results
      await db.execute(
        'UPDATE ideas SET generated_spec = ?, status = ?, processing_time_ms = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [formattedSpec, 'completed', totalDuration, recordId]
      );
      
      console.log(`Spec generation completed in ${totalDuration}ms (Gemini: ${result.duration}ms)`);
      
      res.json({
        id: recordId,
        userInput: idea,
        generatedSpec: formattedSpec,
        status: 'completed',
        processingTime: totalDuration,
        geminiDuration: result.duration,
        attempt: result.attempt,
        createdAt: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('Error generating spec:', error);
      
      // Update database record with failure status if record was created
      if (recordId) {
        try {
          await db.execute(
            'UPDATE ideas SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            ['failed', recordId]
          );
        } catch (dbError) {
          console.error('Error updating failed record:', dbError);
        }
      }
      
      next(error);
    }
  }
);

// Get history with pagination and search
app.get('/api/history', 
  validateRequest(schemas.historyQuery),
  async (req, res, next) => {
    try {
      const { page, limit, search } = req.validatedData;
      const offset = (page - 1) * limit;
      
      // Ensure parameters are numbers
      const limitNum = parseInt(limit, 10);
      const offsetNum = parseInt(offset, 10);
      
      // First, try a simple count query to test database connection
      const countResult = await db.execute('SELECT COUNT(*) as total FROM ideas');
      const total = countResult.rows[0].total || 0;
      
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
      const dataResult = await db.execute(query, queryParams);
      
      // Process data to create preview
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
      
      const result = await db.execute(
        'SELECT * FROM ideas WHERE id = ?',
        [id]
      );
      
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
      
      const result = await db.execute(
        'SELECT * FROM ideas WHERE id = ?',
        [id]
      );
      
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
      const checkResult = await db.execute(
        'SELECT id FROM ideas WHERE id = ?',
        [id]
      );
      
      if (checkResult.rows.length === 0) {
        return res.status(404).json({ 
          error: 'Entry not found',
          timestamp: new Date().toISOString(),
          id: parseInt(id)
        });
      }
      
      // Delete the entry
      await db.execute('DELETE FROM ideas WHERE id = ?', [id]);
      
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
    
    // Test Gemini CLI availability
    let geminiAvailable = false;
    try {
      await new Promise((resolve, reject) => {
        const testProcess = spawn('gemini', ['--version'], { timeout: 5000 });
        testProcess.on('close', (code) => {
          if (code === 0) {
            geminiAvailable = true;
          }
          resolve();
        });
        testProcess.on('error', () => resolve());
      });
    } catch (error) {
      // Gemini CLI not available
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
        geminiCLI: geminiAvailable ? 'available' : 'unavailable'
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
    
    // Periodic health checks
    setInterval(async () => {
      try {
        const dbHealth = await checkDatabaseHealth();
        const geminiHealth = await checkGeminiHealth();
        
        if (dbHealth.status !== 'healthy' || geminiHealth.status !== 'healthy') {
          logger.warn({ dbHealth, geminiHealth }, 'Service health degraded');
        }
      } catch (error) {
        logger.error({ error }, 'Periodic health check failed');
      }
    }, 60000); // Check every minute
    
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