'use strict';

const mongoose = require('mongoose');

/**
 * InvoiceSequence — Atomic counter for per-client, per-series invoice numbering.
 *
 * One document per (company + client + series + fiscalYear) quad.
 * `current` is the last number issued; the next invoice gets current + 1.
 *
 * ── Scoping ─────────────────────────────────────────────────────────────────
 * series=null   → company-default sequence (backward compat with old invoices)
 * series=ObjectId → series-specific sequence (e.g. SSI/PAL counter for Client A)
 *
 * This means Client A can have independent counters for each series they are
 * invoiced under — SSI/PAL-2026-27-000003 and SSI/COM-2026-27-000001 are
 * separate sequences, both scoped to the same client.
 *
 * ── Concurrency ─────────────────────────────────────────────────────────────
 * findOneAndUpdate + $inc is a single atomic WiredTiger operation.  Two
 * concurrent invoice creations for the same (company, client, series, fiscalYear)
 * are serialised at the document level — they receive current=1 and current=2.
 *
 * ── Database migration note ──────────────────────────────────────────────────
 * Upgrading from the previous schema (no series field, index was
 * { company, client, fiscalYear }):
 *
 *   1. Drop the old index:
 *      db.invoicesequences.dropIndex('company_1_client_1_fiscalYear_1')
 *
 *   2. Restart the app — Mongoose recreates the new index automatically.
 *
 * Existing counter documents without a series field are treated as series=null
 * and continue to work as the company-default sequence.
 */
const invoiceSequenceSchema = new mongoose.Schema(
  {
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
    },
    // null → company-wide (legacy / no series selected)
    // ObjectId → specific InvoiceSeries
    client: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Client',
      default: null,
    },
    // null → no series (backward compat); ObjectId → InvoiceSeries document
    series: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'InvoiceSeries',
      default: null,
    },
    // Format: "YYYY-YY" e.g. "2026-27"
    fiscalYear: {
      type: String,
      required: true,
      match: [/^\d{4}-\d{2}$/, 'fiscalYear must be in YYYY-YY format'],
    },
    // The last issued sequence number for this quad.
    current: {
      type: Number,
      default: 0,
      min: [0, 'Sequence current value cannot be negative'],
    },
  },
  {
    timestamps: false,
    versionKey: false,
  },
);

// ─── Indexes ──────────────────────────────────────────────────────────────────
// Unique per (company, client, series, fiscalYear).
// series=null and series=ObjectId are distinct values → each series gets its own
// independent counter per client per fiscal year.
invoiceSequenceSchema.index(
  { company: 1, client: 1, series: 1, fiscalYear: 1 },
  { unique: true },
);

module.exports = mongoose.model('InvoiceSequence', invoiceSequenceSchema);
