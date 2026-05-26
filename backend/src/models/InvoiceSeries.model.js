'use strict';

const mongoose = require('mongoose');

/**
 * InvoiceSeries — Named invoice number prefixes per company.
 *
 * Each document represents one series, e.g. "SSI/PAL", "SSI/COM", "SSI/US".
 * Invoices are optionally linked to a series; if none is selected the company's
 * shortCode / invoiceSettings.prefix is used as before (backward compat).
 *
 * Format: {prefix}-{fiscalYear}-{sequence}
 * Example: SSI/PAL-2026-27-000001
 *
 * ── Uniqueness ────────────────────────────────────────────────────────────────
 * (company, prefix) is unique — you cannot have two "SSI/PAL" series in the
 * same company.
 *
 * ── Default series ────────────────────────────────────────────────────────────
 * At most one series per company has isDefault=true.  The invoiceSeries.service
 * ensures this invariant is maintained (setting one default clears all others).
 */
const invoiceSeriesSchema = new mongoose.Schema(
  {
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    // The prefix string, e.g. "SSI/PAL", "SSI/COM", "SSI/US"
    // Stored uppercase; slashes are valid (they appear in the invoice number).
    prefix: {
      type: String,
      required: [true, 'Series prefix is required'],
      trim: true,
      uppercase: true,
      maxlength: [30, 'Prefix cannot exceed 30 characters'],
      match: [
        /^[A-Z0-9/_-]+$/,
        'Prefix may only contain letters, numbers, /, _, and -',
      ],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [200, 'Description cannot exceed 200 characters'],
    },
    // Optional: lock this series to a specific client.
    // When set, selecting this series in CreateInvoice auto-fills the client.
    client: {
      type: mongoose.Schema.Types.ObjectId,
      ref:  'Client',
      default: null,
    },
    // Exactly one series per company may be the default.
    // invoiceSeries.service.setDefault() enforces this.
    isDefault: { type: Boolean, default: false },
    isActive:  { type: Boolean, default: true },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

// ─── Indexes ──────────────────────────────────────────────────────────────────
// One prefix per company.
invoiceSeriesSchema.index({ company: 1, prefix: 1 }, { unique: true });
// Fast lookup of the default series for a company.
invoiceSeriesSchema.index({ company: 1, isDefault: 1 });

module.exports = mongoose.model('InvoiceSeries', invoiceSeriesSchema);
