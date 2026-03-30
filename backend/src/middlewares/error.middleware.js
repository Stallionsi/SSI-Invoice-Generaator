const logger = require('../utils/logger');
const { NODE_ENV } = require('../config/env');

/**
 * Global Express error handler.
 * Must be the LAST middleware registered in app.js.
 * Handles Mongoose errors, JWT errors, and generic 500s.
 */
const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message    = err.message    || 'Internal Server Error';
  let errors     = null;

  // ── Mongoose: Validation error ─────────────────────────────────────────
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation Error';
    errors = Object.values(err.errors).map((e) => ({
      field:   e.path,
      message: e.message,
    }));
  }

  // ── Mongoose: Duplicate key ────────────────────────────────────────────
  if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    message = `${field} already exists`;
  }

  // ── Mongoose: Cast error (invalid ObjectId) ────────────────────────────
  if (err.name === 'CastError') {
    statusCode = 400;
    message = `Invalid ${err.path}: ${err.value}`;
  }

  // ── JWT errors ─────────────────────────────────────────────────────────
  if (err.name === 'JsonWebTokenError') { statusCode = 401; message = 'Invalid token'; }
  if (err.name === 'TokenExpiredError') { statusCode = 401; message = 'Token expired'; }

  // ── Log server errors ──────────────────────────────────────────────────
  if (statusCode >= 500) {
    logger.error('Server error:', {
      message: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method,
    });
  }

  const body = { success: false, message };
  if (errors) body.errors = errors;

  // Stack trace only in development
  if (NODE_ENV === 'development') body.stack = err.stack;

  res.status(statusCode).json(body);
};

/**
 * Wrap async controller functions to forward errors to errorHandler.
 * Usage: router.get('/', asyncHandler(controller.list))
 */
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { errorHandler, asyncHandler };
