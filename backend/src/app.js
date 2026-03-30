const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');

const { CLIENT_URL, NODE_ENV, RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX, UPLOAD_DIR } = require('./config/env');
const logger = require('./utils/logger');

// ─── Routes ────────────────────────────────────────────────────────────────
const authRoutes        = require('./routes/auth.routes');
const companyRoutes     = require('./routes/company.routes');
const clientRoutes      = require('./routes/client.routes');
const invoiceRoutes     = require('./routes/invoice.routes');
const paymentRoutes     = require('./routes/payment.routes');
const reportRoutes      = require('./routes/report.routes');
const customFieldRoutes = require('./routes/customField.routes');
const utilsRoutes       = require('./routes/utils.routes');

// ─── Middlewares ───────────────────────────────────────────────────────────
const { errorHandler } = require('./middlewares/error.middleware');
const { auditLogger }  = require('./middlewares/auditLog.middleware');

const app = express();

// ─── Security Headers ──────────────────────────────────────────────────────
app.use(helmet());

// ─── CORS ──────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: CLIENT_URL,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Company-Id'],
  })
);

// ─── Compression ───────────────────────────────────────────────────────────
app.use(compression());

// ─── Cookie Parsing ────────────────────────────────────────────────────────
app.use(cookieParser());

// ─── Body Parsing ──────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ─── HTTP Request Logging ──────────────────────────────────────────────────
if (NODE_ENV !== 'test') {
  app.use(
    morgan('combined', {
      stream: { write: (message) => logger.http(message.trim()) },
      skip: (req) => req.url === '/api/health',
    })
  );
}

// ─── Rate Limiting ─────────────────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please try again later.' },
});
app.use('/api/', globalLimiter);

// Auth endpoints get a stricter limiter
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 10,
  message: { success: false, message: 'Too many authentication attempts. Try again in 15 minutes.' },
});
app.use('/api/auth/', authLimiter);

// ─── Static Files (generated PDFs) ────────────────────────────────────────
app.use('/uploads', express.static(path.resolve(UPLOAD_DIR)));

// ─── Health Check ──────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'Invoice Generator API is running', env: NODE_ENV });
});

// ─── Audit Logging Middleware ──────────────────────────────────────────────
app.use(auditLogger);

// ─── API Routes ────────────────────────────────────────────────────────────
app.use('/api/auth',          authRoutes);
app.use('/api/company',       companyRoutes);
app.use('/api/clients',       clientRoutes);
app.use('/api/invoices',      invoiceRoutes);
app.use('/api/payments',      paymentRoutes);
app.use('/api/reports',       reportRoutes);
app.use('/api/custom-fields', customFieldRoutes);
app.use('/api/utils',         utilsRoutes);

// ─── 404 Handler ──────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` });
});

// ─── Global Error Handler ─────────────────────────────────────────────────
app.use(errorHandler);

module.exports = app;
