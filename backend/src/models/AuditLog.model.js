const mongoose = require('mongoose');

/**
 * AuditLog Schema
 * Immutable record of every state-changing action in the system
 * Used for compliance, debugging, and security forensics
 */
const auditLogSchema = new mongoose.Schema(
  {
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    action: {
      type: String,
      required: true,
      // e.g. 'invoice.created', 'invoice.sent', 'payment.recorded', 'user.login'
    },
    entity: {
      type: String,
      required: true,
      enum: ['Invoice', 'Client', 'Company', 'Payment', 'User'],
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      index: true,
    },
    // Before and after state for change tracking
    previousState: { type: mongoose.Schema.Types.Mixed, select: false },
    newState: { type: mongoose.Schema.Types.Mixed, select: false },
    // Request metadata
    ipAddress: { type: String },
    userAgent: { type: String },
    httpMethod: { type: String },
    endpoint: { type: String },
    statusCode: { type: Number },
    // Human readable description
    description: { type: String },
  },
  {
    timestamps: true,
    // Audit logs are immutable — disable updates
  }
);

// ─── Indexes ───────────────────────────────────────────────────────────────
auditLogSchema.index({ company: 1, createdAt: -1 });
auditLogSchema.index({ entity: 1, entityId: 1 });
auditLogSchema.index({ user: 1, createdAt: -1 });
// Auto-expire audit logs after 2 years (optional, remove if you need permanent logs)
// auditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 63072000 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
