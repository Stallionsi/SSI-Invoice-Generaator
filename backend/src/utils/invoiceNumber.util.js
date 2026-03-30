const Company  = require('../models/Company.model');
const Invoice  = require('../models/Invoice.model');
const { INVOICE_NUMBER_PREFIX, INVOICE_NUMBER_PADDING } = require('../config/env');

/**
 * Generates the next sequential invoice number for a company.
 * Uses findOneAndUpdate with $inc for atomic increment —
 * safe under concurrent load (thousands of invoices/day).
 *
 * Format: {PREFIX}-{YEAR}-{PADDED_NUMBER}
 * Example: INV-2024-000042
 */
const generateInvoiceNumber = async (companyId) => {
  const year = new Date().getFullYear();

  const company = await Company.findOneAndUpdate(
    { _id: companyId },
    { $inc: { 'invoiceSettings.nextNumber': 1 } },
    { new: false, select: 'invoiceSettings' } // returns BEFORE increment → current number
  );

  if (!company) throw new Error('Company not found for invoice number generation');

  const currentNumber = company.invoiceSettings?.nextNumber || 1;
  const prefix        = company.invoiceSettings?.prefix || INVOICE_NUMBER_PREFIX || 'INV';
  const padding       = parseInt(INVOICE_NUMBER_PADDING || '6', 10);

  const padded = String(currentNumber).padStart(padding, '0');
  return `${prefix}-${year}-${padded}`;
};

/**
 * Preview the next invoice number without incrementing the counter.
 */
const previewNextInvoiceNumber = async (companyId) => {
  const year = new Date().getFullYear();
  const company = await Company.findById(companyId).select('invoiceSettings');
  if (!company) throw new Error('Company not found');

  const nextNumber = company.invoiceSettings?.nextNumber || 1;
  const prefix     = company.invoiceSettings?.prefix || INVOICE_NUMBER_PREFIX || 'INV';
  const padding    = parseInt(INVOICE_NUMBER_PADDING || '6', 10);

  return `${prefix}-${year}-${String(nextNumber).padStart(padding, '0')}`;
};

/**
 * Preview the next invoice number based on a specific client's last invoice.
 * Finds the most recent invoice for {company, client}, parses its numeric suffix,
 * and returns PREFIX-YEAR-(lastNum+1).
 * Falls back to the company counter preview when the client has no prior invoices.
 */
const previewNextForClient = async (companyId, clientId) => {
  const company = await Company.findById(companyId).select('invoiceSettings').lean();
  if (!company) throw new Error('Company not found');

  const prefix  = company.invoiceSettings?.prefix || INVOICE_NUMBER_PREFIX || 'INV';
  const padding = parseInt(INVOICE_NUMBER_PADDING || '6', 10);
  const year    = new Date().getFullYear();

  // Most recent invoice for this client under this company
  const last = await Invoice
    .findOne({ company: companyId, client: clientId })
    .sort({ createdAt: -1 })
    .select('invoiceNumber')
    .lean();

  if (!last) {
    // Client has no invoices yet — fall back to the company's most recent invoice
    const lastCompany = await Invoice
      .findOne({ company: companyId })
      .sort({ createdAt: -1 })
      .select('invoiceNumber')
      .lean();

    if (lastCompany) {
      const parts   = lastCompany.invoiceNumber.split('-');
      const lastNum = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(lastNum)) {
        return `${prefix}-${year}-${String(lastNum + 1).padStart(padding, '0')}`;
      }
    }

    // Absolute fallback — no invoices exist at all
    const nextNumber = company.invoiceSettings?.nextNumber || 1;
    return `${prefix}-${year}-${String(nextNumber).padStart(padding, '0')}`;
  }

  // Parse the numeric suffix — works for "SSI/COM-2026-002001" → 2001
  const parts  = last.invoiceNumber.split('-');
  const lastNum = parseInt(parts[parts.length - 1], 10);

  if (isNaN(lastNum)) {
    // Can't parse — fall back to company counter preview
    const nextNumber = company.invoiceSettings?.nextNumber || 1;
    return `${prefix}-${year}-${String(nextNumber).padStart(padding, '0')}`;
  }

  return `${prefix}-${year}-${String(lastNum + 1).padStart(padding, '0')}`;
};

module.exports = { generateInvoiceNumber, previewNextInvoiceNumber, previewNextForClient };
