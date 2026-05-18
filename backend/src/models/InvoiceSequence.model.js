const mongoose = require('mongoose');

/**
 * InvoiceSequence — Atomic counter for per-client invoice numbering.
 *
 * One document per (company + client + fiscalYear) triple.
 * `current` is the last number issued; the next invoice gets current + 1.
 *
 * ── Why per-client? ────────────────────────────────────────────────────────
 * Each client's invoices have their own sequence, so Client A receives
 * SSI-2026-27-0001, 0002, 0003 and Client B independently receives
 * SSI-2026-27-0001, 0002.  The (company, client, invoiceNumber) unique index
 * on the Invoice collection prevents collisions within a client.
 *
 * ── Concurrency ────────────────────────────────────────────────────────────
 * findOneAndUpdate + $inc is a single atomic WiredTiger operation.  Two
 * concurrent invoice creations for the same client+fiscalYear are serialised
 * at the document level — they receive current=1 and current=2, never both 1.
 *
 * ── Database migration note ─────────────────────────────────────────────────
 * If upgrading from the old company-only schema, drop the old index and let
 * Mongoose recreate it:
 *   db.invoicesequences.dropIndex('company_1_fiscalYear_1')
 * (existing counter documents without a client field are treated as client=null)
 */
const invoiceSequenceSchema = new mongoose.Schema(
  {
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
    },
    // null for legacy/company-wide counters; set to a Client ObjectId for per-client
    client: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Client',
      default: null,
    },
    // Format: "YYYY-YY" e.g. "2026-27"
    fiscalYear: {
      type: String,
      required: true,
      match: [/^\d{4}-\d{2}$/, 'fiscalYear must be in YYYY-YY format'],
    },
    // The last issued sequence number for this (company + client + fiscalYear).
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

// Unique per (company, client, fiscalYear) — enforces correct atomic upsert behaviour.
// client: null is treated as a distinct value, so company-wide fallback counters
// (client=null) coexist safely with per-client counters.
invoiceSequenceSchema.index({ company: 1, client: 1, fiscalYear: 1 }, { unique: true });

module.exports = mongoose.model('InvoiceSequence', invoiceSequenceSchema);
