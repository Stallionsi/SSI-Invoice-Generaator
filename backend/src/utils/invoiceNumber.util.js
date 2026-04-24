const Company = require('../models/Company.model');
const Invoice  = require('../models/Invoice.model');
const { INVOICE_NUMBER_PREFIX, INVOICE_NUMBER_PADDING } = require('../config/env');

// Indian fiscal year: April–March. Returns e.g. { start: 2026, endShort: '27' }
const getFiscalYear = () => {
  const now   = new Date();
  const year  = now.getFullYear();
  const month = now.getMonth(); // 0-based; April = 3
  const start = month >= 3 ? year : year - 1;
  return { start, endShort: String(start + 1).slice(-2) };
};

/**
 * Returns the next available invoice number for a specific client.
 *
 * Rules:
 *  - Existing client → last invoice number + 1, walking forward past any gaps
 *  - New client      → company.invoiceSettings.nextNumber (configurable starting point)
 *
 * Collision check is scoped to (company + client).
 * Two different clients CAN share the same invoice number — this is intentional.
 */
const getNextClientInvoiceNumber = async (companyId, clientId) => {
  const company = await Company.findById(companyId).select('invoiceSettings').lean();
  if (!company) throw new Error('Company not found');

  const prefix  = company.invoiceSettings?.prefix || INVOICE_NUMBER_PREFIX || 'INV';
  const padding = parseInt(INVOICE_NUMBER_PADDING || '6', 10);
  const { start: fyStart, endShort: fyEnd } = getFiscalYear();
  const startAt = company.invoiceSettings?.nextNumber || 1;

  // Most recent invoice for THIS client only
  const last = await Invoice
    .findOne({ company: companyId, client: clientId })
    .sort({ createdAt: -1 })
    .select('invoiceNumber')
    .lean();

  let candidate;
  if (!last) {
    // New client — start from the company's configured starting number
    candidate = startAt;
  } else {
    const parts   = last.invoiceNumber.split('-');
    const lastNum = parseInt(parts[parts.length - 1], 10);
    // If the stored number can't be parsed fall back to the starting number
    candidate = isNaN(lastNum) ? startAt : lastNum + 1;
  }

  // Walk forward until the number is free FOR THIS CLIENT.
  // Different clients may already hold the same number — we do NOT skip those.
  let candidateStr;
  do {
    candidateStr = `${prefix}-${fyStart}-${fyEnd}-${String(candidate).padStart(padding, '0')}`;
    const taken = await Invoice.findOne({
      company:       companyId,
      client:        clientId,
      invoiceNumber: candidateStr,
    }).select('_id').lean();
    if (!taken) break;
    candidate++;
  } while (true);

  return candidateStr;
};

/**
 * Preview the next invoice number for a client — used by the GET /next-number API.
 * Delegates to getNextClientInvoiceNumber (no side effects).
 */
const previewNextForClient = async (companyId, clientId) => {
  return getNextClientInvoiceNumber(companyId, clientId);
};

/**
 * Fallback preview shown before a client is selected.
 * Just displays what a new client's first invoice would look like.
 */
const previewNextInvoiceNumber = async (companyId) => {
  const company = await Company.findById(companyId).select('invoiceSettings').lean();
  if (!company) throw new Error('Company not found');

  const prefix  = company.invoiceSettings?.prefix || INVOICE_NUMBER_PREFIX || 'INV';
  const padding = parseInt(INVOICE_NUMBER_PADDING || '6', 10);
  const { start: fyStart, endShort: fyEnd } = getFiscalYear();
  const startAt = company.invoiceSettings?.nextNumber || 1;

  return `${prefix}-${fyStart}-${fyEnd}-${String(startAt).padStart(padding, '0')}`;
};

module.exports = { getNextClientInvoiceNumber, previewNextForClient, previewNextInvoiceNumber };
