const mongoose = require('mongoose');

/**
 * EmailLog Schema
 * Full audit trail of every email sent from the system
 * Includes invoice emails, reminders, receipts, and system emails
 */
const emailLogSchema = new mongoose.Schema(
  {
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      index: true,
    },
    invoice: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Invoice',
      index: true,
    },
    type: {
      type: String,
      enum: [
        'invoice_send',
        'payment_reminder',
        'payment_receipt',
        'welcome',
        'password_reset',
        'invoice_viewed',
        'other',
      ],
      required: true,
      index: true,
    },
    from: { type: String, required: true },
    to: [{ type: String }],
    cc: [{ type: String }],
    bcc: [{ type: String }],
    subject: { type: String, required: true },
    // HTML body — stored for resend capability
    body: { type: String, select: false },
    // Attachment file names sent
    attachments: [{ type: String }],
    // Email provider response
    provider: {
      type: String,
      enum: ['smtp', 'ses', 'sendgrid', 'resend'],
      default: 'smtp',
    },
    providerId: { type: String },      // message ID from provider
    status: {
      type: String,
      enum: ['queued', 'sent', 'delivered', 'failed', 'bounced', 'opened'],
      default: 'queued',
      index: true,
    },
    errorMessage: { type: String },
    openedAt: { type: Date },
    deliveredAt: { type: Date },
    sentBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

// ─── Indexes ───────────────────────────────────────────────────────────────
emailLogSchema.index({ company: 1, createdAt: -1 });
emailLogSchema.index({ invoice: 1, type: 1 });
emailLogSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('EmailLog', emailLogSchema);
