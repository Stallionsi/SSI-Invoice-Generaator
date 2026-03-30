const mongoose = require('mongoose');

/**
 * ReminderLog Schema
 * Tracks every payment reminder sent for an invoice
 * Used to prevent duplicate sends and to show audit trail
 */
const reminderLogSchema = new mongoose.Schema(
  {
    invoice: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Invoice',
      required: true,
      index: true,
    },
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    client: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Client',
    },
    // Which reminder type was this?
    reminderType: {
      type: String,
      enum: [
        'before_due_3days',
        'on_due_date',
        'after_due_3days',
        'after_due_7days',
        'after_due_14days',
        'after_due_30days',
        'manual',
        'weekly',
      ],
      required: true,
    },
    sentTo: [{ type: String }],       // email addresses
    sentAt: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: ['sent', 'failed', 'skipped'],
      default: 'sent',
    },
    errorMessage: { type: String },
    // Snapshot of invoice balance at time of reminder
    balanceDue: { type: Number },
    dueDate: { type: Date },
    // BullMQ job ID for tracking
    jobId: { type: String },
  },
  {
    timestamps: true,
  }
);

// ─── Indexes ───────────────────────────────────────────────────────────────
reminderLogSchema.index({ invoice: 1, reminderType: 1 });
reminderLogSchema.index({ company: 1, sentAt: -1 });

module.exports = mongoose.model('ReminderLog', reminderLogSchema);
