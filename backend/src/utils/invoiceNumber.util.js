const Company         = require('../models/Company.model');
const InvoiceSequence = require('../models/InvoiceSequence.model');
const { INVOICE_NUMBER_PREFIX, INVOICE_NUMBER_PADDING } = require('../config/env');

// ─── Shared Utilities ─────────────────────────────────────────────────────────

const getFiscalYearKey = () => {
  const now   = new Date();
  const year  = now.getFullYear();
  const month = now.getMonth(); // 0-indexed; April = 3
  const start = month >= 3 ? year : year - 1;
  return `${start}-${String(start + 1).slice(-2)}`;
};

const getCompanyPrefix = (company) =>
  company.shortCode?.trim() ||
  company.invoiceSettings?.prefix?.trim() ||
  INVOICE_NUMBER_PREFIX ||
  'INV';

// ─── Seed-on-First-Use ────────────────────────────────────────────────────────
//
// When a client's InvoiceSequence document doesn't exist yet (brand-new client
// OR migration from the old company-wide counter), we look at their existing
// invoices to find the highest sequence number and seed the counter there.
//
// This prevents assigning 0001 to a client who already has invoices numbered
// 0001–0003, which would trigger a unique-index violation on creation.
//
// Concurrency: if two requests race to create the document, one gets a
// duplicate-key error (code 11000) and silently falls through — both then
// proceed to the $inc step and receive distinct values.
//
const ensureSequenceSeeded = async (companyId, clientId, fiscalYear) => {
  // Fast path — document already exists, nothing to do.
  const exists = await InvoiceSequence.exists({ company: companyId, client: clientId, fiscalYear });
  if (exists) return;

  // Lazy-require avoids a potential circular-dependency at module load time.
  const Invoice = require('../models/Invoice.model');

  // Find the last invoice this client ever received for this company and
  // extract the trailing numeric segment (e.g. "SSI-2026-27-0003" → 3).
  const lastInv = await Invoice
    .findOne({ company: companyId, client: clientId })
    .sort({ createdAt: -1 })
    .select('invoiceNumber')
    .lean();

  let seedValue = 0;
  if (lastInv?.invoiceNumber) {
    const parts = lastInv.invoiceNumber.split('-');
    const num   = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(num)) seedValue = num;
  }

  // Create the sequence document starting at seedValue so the first $inc
  // produces seedValue + 1 — continuing right after the last real invoice.
  try {
    await InvoiceSequence.create({
      company:    companyId,
      client:     clientId,
      fiscalYear,
      current:    seedValue,
    });
  } catch (e) {
    if (e.code !== 11000) throw e; // 11000 = duplicate key → another request won the race, that's fine
  }
};

// ─── Atomic Per-Client Sequencing ─────────────────────────────────────────────

/**
 * Atomically reserves and returns the next invoice number for a (company, client).
 *
 * Scoped by (company + client + fiscalYear) — each client has their own
 * independent counter that resets every April.
 *
 * @param {string|ObjectId} companyId
 * @param {{ clientId?: string|ObjectId, fiscalYear?: string }} [opts]
 * @returns {Promise<string>}  e.g. "SSI-2026-27-0004"
 */
const reserveNextInvoiceNumber = async (companyId, opts = {}) => {
  const company = await Company
    .findById(companyId)
    .select('shortCode invoiceSettings')
    .lean();
  if (!company) throw Object.assign(new Error('Company not found'), { statusCode: 404 });

  const prefix     = getCompanyPrefix(company);
  const fiscalYear = opts.fiscalYear ?? getFiscalYearKey();
  const clientId   = opts.clientId   ?? null;

  // Initialise the counter from existing invoices if this is the first time
  // we're issuing a number for this client.
  await ensureSequenceSeeded(companyId, clientId, fiscalYear);

  // Single atomic operation — two concurrent calls for the same
  // (company, client, fiscalYear) receive distinct values.
  const seq = await InvoiceSequence.findOneAndUpdate(
    { company: companyId, client: clientId, fiscalYear },
    { $inc: { current: 1 } },
    { new: true },          // upsert intentionally removed — ensureSequenceSeeded guarantees existence
  );

  return `${prefix}-${fiscalYear}-${String(seq.current).padStart(INVOICE_NUMBER_PADDING, '0')}`;
};

/**
 * Returns a preview of the next invoice number WITHOUT incrementing the counter.
 *
 * Called by GET /api/invoices/next-number — shows the user what their next
 * invoice number will look like when they submit the form.
 *
 * Side-effect: seeds the InvoiceSequence document on first access for a client,
 * so the preview is always accurate (no spurious 0001 for existing clients).
 *
 * @param {string|ObjectId} companyId
 * @param {string|ObjectId|null} [clientId]
 * @returns {Promise<string>}  e.g. "SSI-2026-27-0004"
 */
const previewNextInvoiceNumber = async (companyId, clientId = null) => {
  const company = await Company
    .findById(companyId)
    .select('shortCode invoiceSettings')
    .lean();
  if (!company) throw Object.assign(new Error('Company not found'), { statusCode: 404 });

  const prefix     = getCompanyPrefix(company);
  const fiscalYear = getFiscalYearKey();

  // Seed on first access so the preview reflects actual invoice history.
  await ensureSequenceSeeded(companyId, clientId, fiscalYear);

  const seq = await InvoiceSequence
    .findOne({ company: companyId, client: clientId, fiscalYear })
    .select('current')
    .lean();

  const next = (seq?.current ?? 0) + 1;
  return `${prefix}-${fiscalYear}-${String(next).padStart(INVOICE_NUMBER_PADDING, '0')}`;
};

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  reserveNextInvoiceNumber,
  previewNextInvoiceNumber,
  getFiscalYearKey,
  getCompanyPrefix,
};
