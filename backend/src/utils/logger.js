const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const { LOG_LEVEL, LOG_DIR, NODE_ENV } = require('../config/env');

const logDir = path.resolve(LOG_DIR || 'logs');

const { combine, timestamp, printf, colorize, errors, json } = winston.format;

// ─── Human-readable format for dev console ───────────────────────────────
const devFormat = combine(
  colorize(),
  timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  errors({ stack: true }),
  printf(({ level, message, timestamp, stack, ...meta }) => {
    let log = `${timestamp} [${level}]: ${message}`;
    if (stack) log += `\n${stack}`;
    if (Object.keys(meta).length) log += `\n${JSON.stringify(meta, null, 2)}`;
    return log;
  })
);

// ─── JSON format for production (ELK, Datadog, etc.) ─────────────────────
const prodFormat = combine(
  timestamp(),
  errors({ stack: true }),
  json()
);

const transports = [
  new winston.transports.Console({
    format: NODE_ENV === 'production' ? prodFormat : devFormat,
  }),
];

// File rotation in production
if (NODE_ENV === 'production') {
  transports.push(
    new DailyRotateFile({
      dirname: logDir,
      filename: 'app-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '30d',
      level: 'info',
      format: prodFormat,
    }),
    new DailyRotateFile({
      dirname: logDir,
      filename: 'error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '90d',
      level: 'error',
      format: prodFormat,
    })
  );
}

const logger = winston.createLogger({
  level: LOG_LEVEL || 'info',
  transports,
  exitOnError: false,
});

module.exports = logger;
