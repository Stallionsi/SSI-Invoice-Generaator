const AuditLog = require('../models/AuditLog.model');
const logger = require('../utils/logger');

/**
 * Passive audit logger middleware.
 * Hooks into response finish event to log every state-changing API call.
 * Does not block the request.
 */
const auditLogger = (req, res, next) => {
  // Only log mutating methods
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    return next();
  }

  res.on('finish', async () => {
    try {
      if (!req.user) return; // unauthenticated requests skip audit

      // Derive entity type from URL
      const urlParts = req.path.split('/').filter(Boolean);
      const entityMap = {
        invoices:    'Invoice',
        clients:     'Client',
        company:     'Company',
        payments:    'Payment',
        auth:        'User',
      };
      const entity = entityMap[urlParts[0]] || 'Invoice';

      await AuditLog.create({
        company:    req.user.company,
        user:       req.user._id,
        action:     `${entity.toLowerCase()}.${req.method.toLowerCase()}`,
        entity,
        entityId:   req.params?.id || null,
        ipAddress:  req.ip || req.socket?.remoteAddress,
        userAgent:  req.headers['user-agent'],
        httpMethod: req.method,
        endpoint:   req.originalUrl,
        statusCode: res.statusCode,
        description: `${req.method} ${req.originalUrl} → ${res.statusCode}`,
      });
    } catch (err) {
      // Never let audit logging break the request flow
      logger.warn('Audit log failed:', err.message);
    }
  });

  next();
};

/**
 * Manual audit log helper — call from services for fine-grained events.
 */
const logAction = async ({ company, user, action, entity, entityId, description, previousState, newState }) => {
  try {
    await AuditLog.create({ company, user, action, entity, entityId, description, previousState, newState });
  } catch (err) {
    logger.warn('Manual audit log failed:', err.message);
  }
};

module.exports = { auditLogger, logAction };
