import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';

import authRoutes from './routes/authRoutes';
import databaseRoutes from './routes/databaseRoutes';
import databaseManagementRoutes from './routes/databaseManagementRoutes';
import userRoutes from './routes/userRoutes';
import metricsRoutes from './routes/metricsRoutes';
import haulingRoutes from './routes/hauling';
import { errorHandler } from './middleware/errorHandler';
import { formatDetector } from './middleware/formatDetector';
import { responseTransformer } from './middleware/responseTransformer';

dotenv.config();

const app: Application = express();
const PORT = process.env.PORT || 4000;

// Security Middleware
app.use(helmet());
app.use(cors({
  origin: ['http://localhost:3000', 'https://app.azdevops.io', 'https://webpanel-five.vercel.app'],
  credentials: true
}));

// Trust proxy (required for nginx and per-IP rate limiting)
app.set('trust proxy', 1);

// Tiered Rate Limiting - Per IP, different limits per endpoint type

// Auth endpoints - Low limit (prevent brute force)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100, // 100 requests per 15min per IP
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: 'Too many login attempts, please try again later.'
    });
  }
});

// Real-time endpoints - Very high limit
const realtimeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15000, // 15,000 requests per 15min per IP (allows polling every 30s)
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: 'Rate limit exceeded. Please reduce polling frequency.'
    });
  }
});

// General API - Medium limit
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3000, // 3,000 requests per 15min per IP
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: 'Too many requests, please try again later.'
    });
  }
});

// Body Parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 🔥 COMPATIBILITY LAYER - Auto-detects client format and transforms responses
app.use(formatDetector);
app.use(responseTransformer);

// Health Check (no rate limit)
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'DevApi is running!',
    services: ['auth', 'database', 'hauling'],
    timestamp: new Date().toISOString(),
    compatibilityLayer: 'active',
    rateLimiting: 'tiered-per-ip'
  });
});

// Routes with specific rate limits
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/hauling/heartbeat', realtimeLimiter);
app.use('/api/hauling/location', realtimeLimiter);
app.use('/api/hauling', generalLimiter, haulingRoutes);
app.use('/api/database', generalLimiter, databaseRoutes);
app.use('/api/databases', generalLimiter, databaseManagementRoutes);
app.use('/api/users', generalLimiter, userRoutes);
app.use('/api/metrics', generalLimiter, metricsRoutes);

// 404 Handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error Handler (must be last)
app.use(errorHandler);

app.listen(PORT, () => {
  console.log('🚀 DevApi server running on port', PORT);
  console.log('📊 Environment:', process.env.NODE_ENV);
  console.log('🚚 48 Hauling routes loaded');
  console.log('🔥 Compatibility Layer: ACTIVE');
  console.log('⚡ Rate Limiting: Tiered Per-IP');
  console.log('   - Auth: 100/15min per IP');
  console.log('   - Real-time: 15,000/15min per IP');
  console.log('   - General: 3,000/15min per IP');
  console.log('🔗 Health check: http://localhost:' + PORT + '/health');
});

export default app;
