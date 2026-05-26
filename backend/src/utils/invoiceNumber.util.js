'use strict';

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

// ─── Prefix Resolution ────────────────────────────────────────────────────────
//
// Returns { prefix: string, seriesId: ObjectId|null }
//
// Priority:
//  1. seriesId provided → load InvoiceSeries document, use its prefix
//  2. No seriesId → load Company, derive prefix from shortCode / settings (backward compat)
//
const resolvePrefix = async (companyId, seriesId) => {
  if (seriesId) {
    // Lazy-require to avoid circular deps if InvoiceSeries is loaded later
    const InvoiceSeries = require('../models/InvoiceSeries.model');
    const series = await InvoiceSeries
      .findOne({ _id: seriesId, company: companyId, isActive: true })
      .select('prefix')
      .lean();
    if (!series) {
      throw Object.assign(
        new Error('Invoice series not found or is inactive'),
        { statusCode: 404 },
      );
    }
    return { prefix: series.prefix, seriesId: series._id };
  }

  const company = await Company
    .findById(companyId)
    .select('shortCode invoiceSettings')
    .lean();
  if (!company) throw Object.assign(new Error('Company not found'), { statusCode: 404 });

  return { prefix: getCompanyPrefix(company), seriesId: null };
};

// ─── Escape special regex characters in a string ─────────────────────────────
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ─── Seed-on-First-Use ────────────────────────────────────────────────────────
//
// When a (company, client, series, fiscalYear) counter doesn't exist yet,
// scan existing invoices to find the highest sequence number and seed there.
//
// KEY DESIGN: we match invoices by their invoice NUMBER PREFIX, not by the
// `series` field.  This handles two cases correctly:
//
//   1. Old invoices (created before the series system) — they have series=null
//      but their invoiceNumber starts with the correct prefix (e.g. "SSI/PAL-").
//
//   2. New invoices — they have series=ObjectId AND the matching prefix.
//
// Matching by prefix is strictly more correct because the prefix IS the series
// identity that matters to the user.
//
const ensureSequenceSeeded = async (companyId, clientId, seriesId, fiscalYear, prefix) => {
  const normalizedSeriesId = seriesId || null;

  // Fast path — document already exists, nothing to do.
  const exists = await InvoiceSequence.exists({
    company:    companyId,
    client:     clientId ?? null,
    series:     normalizedSeriesId,
    fiscalYear,
  });
  if (exists) return;

  const Invoice = require('../models/Invoice.model');

  // ── Two-pass seed strategy ────────────────────────────────────────────────
  //
  // Pass 1 (preferred): look for invoices in the SAME fiscal year that use
  // the exact "{prefix}-{fiscalYear}-" format (new invoices).
  //
  // Pass 2 (fallback): look for ANY invoice for this client with this prefix,
  // regardless of date or format — handles old invoices that were numbered
  // manually or with a different format (e.g. "SSI/COM-2026-002001").
  // We take the MAX trailing numeric part across all matching invoices.
  //
  // The higher of the two passes is used as the seed so the new sequence
  // never issues a number that already exists in the DB.
  //
  const startYear = parseInt(fiscalYear.split('-')[0], 10);
  const fyFrom    = new Date(startYear,     3,  1,  0,  0,  0);
  const fyTo      = new Date(startYear + 1, 2, 31, 23, 59, 59);

  // Prefix-only pattern (catches ALL old and new formats for this series)
  const prefixOnlyPattern = new RegExp(`^${escapeRegex(prefix)}-`, 'i');

  const baseQuery = { company: companyId, invoiceNumber: { $regex: prefixOnlyPattern } };
  if (clientId) baseQuery.client = clientId;

  // Pass 1 — same fiscal year, exact format
  const fyPattern = new RegExp(`^${escapeRegex(prefix)}-${escapeRegex(fiscalYear)}-`);
  const lastFyInv = await Invoice
    .findOne({ ...baseQuery, invoiceDate: { $gte: fyFrom, $lte: fyTo }, invoiceNumber: { $regex: fyPattern } })
    .sort({ invoiceDate: -1, createdAt: -1 })
    .select('invoiceNumber')
    .lean();

  // Pass 2 — any matching invoice for this client (all-time, any format)
  const lastAnyInv = await Invoice
    .findOne(baseQuery)
    .sort({ createdAt: -1 })
    .select('invoiceNumber')
    .lean();

  const extractNum = (inv) => {
    if (!inv?.invoiceNumber) return 0;
    const parts = inv.invoiceNumber.split('-');
    const num   = parseInt(parts[parts.length - 1], 10);
    return isNaN(num) ? 0 : num;
  };

  // Use the higher of the two so we never re-issue an existing number
  const seedValue = Math.max(extractNum(lastFyInv), extractNum(lastAnyInv));

  try {
    await InvoiceSequence.create({
      company:    companyId,
      client:     clientId ?? null,
      series:     normalizedSeriesId,
      fiscalYear,
      current:    seedValue,
    });
  } catch (e) {
    if (e.code !== 11000) throw e; // 11000 = duplicate key → race was won by peer, OK
  }
};

// ─── Atomic Per-Client Per-Series Sequencing ──────────────────────────────────

/**
 * Atomically reserves and returns the next invoice number.
 *
 * Scoped by (company + client + series + fiscalYear):
 *   - Each client has an independent counter per series.
 *   - No series → backward-compat company-default counter.
 *
 * @param {string|ObjectId} companyId
 * @param {{
 *   clientId?:  string|ObjectId|null,
 *   seriesId?:  string|ObjectId|null,
 *   fiscalYear?: string
 * }} [opts]
 * @returns {Promise<string>}  e.g. "SSI/PAL-2026-27-000004"
 */
const reserveNextInvoiceNumber = async (companyId, opts = {}) => {
  const { clientId = null, seriesId = null, fiscalYear } = opts;

  const { prefix, seriesId: resolvedSeriesId } = await resolvePrefix(companyId, seriesId);
  const fy = fiscalYear ?? getFiscalYearKey();

  await ensureSequenceSeeded(companyId, clientId, resolvedSeriesId, fy, prefix);

  const seq = await InvoiceSequence.findOneAndUpdate(
    {
      company:    companyId,
      client:     clientId   ?? null,
      series:     resolvedSeriesId ?? null,
      fiscalYear: fy,
    },
    { $inc: { current: 1 } },
    { new: true },
  );

  if (!seq) {
    // Extremely rare: seeding succeeded but findOneAndUpdate found nothing.
    // Retry once with upsert as a safety net.
    const fallback = await InvoiceSequence.findOneAndUpdate(
      {
        company:    companyId,
        client:     clientId   ?? null,
        series:     resolvedSeriesId ?? null,
        fiscalYear: fy,
      },
      { $inc: { current: 1 } },
      { new: true, upsert: true },
    );
    return `${prefix}-${fy}-${String(fallback.current).padStart(INVOICE_NUMBER_PADDING, '0')}`;
  }

  return `${prefix}-${fy}-${String(seq.current).padStart(INVOICE_NUMBER_PADDING, '0')}`;
};

/**
 * Returns a PREVIEW of the next invoice number without incrementing the counter.
 *
 * Called by GET /api/invoices/next-number to show the user what their next
 * invoice number will look like.  Seeding happens here too so the preview is
 * always accurate (no spurious 000001 for existing clients).
 *
 * @param {string|ObjectId} companyId
 * @param {string|ObjectId|null} [clientId]
 * @param {string|ObjectId|null} [seriesId]
 * @returns {Promise<string>}  e.g. "SSI/PAL-2026-27-000004"
 */
const previewNextInvoiceNumber = async (companyId, clientId = null, seriesId = null) => {
  const { prefix, seriesId: resolvedSeriesId } = await resolvePrefix(companyId, seriesId);
  const fy = getFiscalYearKey();

  await ensureSequenceSeeded(companyId, clientId, resolvedSeriesId, fy, prefix);

  const seq = await InvoiceSequence
    .findOne({
      company:    companyId,
      client:     clientId         ?? null,
      series:     resolvedSeriesId ?? null,
      fiscalYear: fy,
    })
    .select('current')
    .lean();

  const next = (seq?.current ?? 0) + 1;
  return `${prefix}-${fy}-${String(next).padStart(INVOICE_NUMBER_PADDING, '0')}`;
};

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  reserveNextInvoiceNumber,
  previewNextInvoiceNumber,
  getFiscalYearKey,
  getCompanyPrefix,
};
