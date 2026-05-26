const Decimal = require('decimal.js');

/**
 * Invoice Calculation Utility
 *
 * Uses decimal.js for all financial math to prevent floating-point errors.
 * All inputs are treated as strings or numbers and converted to Decimal.
 * All outputs are plain JS numbers (rounded to 2 decimal places).
 *
 * Currency Rules:
 *  - INR  → full GST logic (CGST/SGST/IGST based on gstType)
 *  - USD  → tax = 0 always (US billing, no indirect tax)
 *  - Other foreign currencies → generic single-rate tax (if gstType ≠ 'none')
 */

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

const toD = (val) => new Decimal(val || 0);
const round2 = (d) => parseFloat(d.toDecimalPlaces(2).toString());

// ─── Line Item Calculation ─────────────────────────────────────────────────
/**
 * Calculate a single line item's amounts.
 *
 * @param {Object} item      - raw line item from request
 * @param {string} gstType   - 'intrastate' | 'interstate' | 'export' | 'none'
 * @param {string} currency  - ISO currency code
 * @param {number|null} globalUnitPrice - if provided, overrides item.unitPrice
 * @returns {Object} enriched item with all computed amounts
 */
const calculateLineItem = (item, gstType = 'intrastate', currency = 'INR', globalUnitPrice = null) => {
  const quantity  = toD(item.quantity);
  // Use globalUnitPrice when provided (new system); fall back to per-item price (legacy)
  const unitPrice = globalUnitPrice !== null
    ? toD(globalUnitPrice)
    : toD(item.unitPrice);

  const grossAmount = quantity.mul(unitPrice);

  // ── Discount ──────────────────────────────────────────────────────────
  let discountAmount = toD(0);
  const discountType  = item.discount?.type  || 'percentage';
  const discountValue = toD(item.discount?.value || 0);

  if (discountValue.gt(0)) {
    if (discountType === 'percentage') {
      discountAmount = grossAmount.mul(discountValue).div(100);
    } else {
      discountAmount = discountValue.gt(grossAmount) ? grossAmount : discountValue;
    }
  }

  const taxableAmount = grossAmount.minus(discountAmount);

  // ── Tax ───────────────────────────────────────────────────────────────
  // USD always has 0 tax; 'none' gstType also forces 0 tax.
  const isUSD  = currency === 'USD';
  const noTax  = isUSD || gstType === 'none';

  const taxRate = noTax ? toD(0) : toD(item.taxRate || 0);
  let cgstRate  = toD(0);
  let sgstRate  = toD(0);
  let igstRate  = toD(0);
  const cessRate = noTax ? toD(0) : toD(item.cessRate || 0);

  if (!noTax) {
    if (currency === 'INR') {
      if (gstType === 'intrastate') {
        cgstRate = taxRate.div(2);
        sgstRate = taxRate.div(2);
      } else if (gstType === 'interstate' || gstType === 'export') {
        igstRate = taxRate;
      }
      // gstType === 'none' already handled above
    } else {
      // Non-INR, non-USD: generic single-rate tax stored in igstRate for aggregation reuse
      igstRate = taxRate;
    }
  }

  const cgstAmount = taxableAmount.mul(cgstRate).div(100);
  const sgstAmount = taxableAmount.mul(sgstRate).div(100);
  const igstAmount = taxableAmount.mul(igstRate).div(100);
  const cessAmount = taxableAmount.mul(cessRate).div(100);
  const taxAmount  = cgstAmount.plus(sgstAmount).plus(igstAmount).plus(cessAmount);
  const lineTotal  = taxableAmount.plus(taxAmount);

  return {
    ...item,
    // Override unitPrice with resolved value so downstream consumers are consistent
    unitPrice:      round2(unitPrice),
    discount:        { type: discountType, value: round2(discountValue) },
    taxRate:         round2(taxRate),
    cgstRate:        round2(cgstRate),
    sgstRate:        round2(sgstRate),
    igstRate:        round2(igstRate),
    cessRate:        round2(cessRate),
    discountAmount:  round2(discountAmount),
    taxableAmount:   round2(taxableAmount),
    cgstAmount:      round2(cgstAmount),
    sgstAmount:      round2(sgstAmount),
    igstAmount:      round2(igstAmount),
    cessAmount:      round2(cessAmount),
    taxAmount:       round2(taxAmount),
    amount:          round2(lineTotal),
  };
};

// ─── Invoice-level Totals ─────────────────────────────────────────────────
/**
 * Calculate full invoice financial summary.
 *
 * @param {Array}  lineItems       - already calculated line items
 * @param {Object} invoiceDiscount - { type: 'percentage'|'fixed', value: Number }
 * @param {Object} opts            - { tdsRate, shippingCharge, additionalCharges, gstType, currency }
 * @returns {Object} summary with all totals
 */
const calculateInvoiceTotals = (lineItems, invoiceDiscount = {}, opts = {}) => {
  const { tdsRate = 0, shippingCharge = 0, additionalCharges = [], currency = 'INR' } = opts;
  const isINR = currency === 'INR';

  // ── Step 1: Subtotal (gross before any discount) ──────────────────────
  let subtotal              = toD(0);
  let lineItemDiscountTotal = toD(0);
  let cgstTotal = toD(0), sgstTotal = toD(0), igstTotal = toD(0), cessTotal = toD(0);

  for (const item of lineItems) {
    const grossLine = toD(item.quantity).mul(toD(item.unitPrice));
    subtotal              = subtotal.plus(grossLine);
    lineItemDiscountTotal = lineItemDiscountTotal.plus(toD(item.discountAmount));
    cgstTotal             = cgstTotal.plus(toD(item.cgstAmount));
    sgstTotal             = sgstTotal.plus(toD(item.sgstAmount));
    igstTotal             = igstTotal.plus(toD(item.igstAmount));
    cessTotal             = cessTotal.plus(toD(item.cessAmount));
  }

  // Taxable base after line-item discounts
  let taxableBase = subtotal.minus(lineItemDiscountTotal);

  // ── Step 2: Invoice-level discount ───────────────────────────────────
  let invoiceDiscountAmount = toD(0);
  const invDiscType  = invoiceDiscount?.type  || 'percentage';
  const invDiscValue = toD(invoiceDiscount?.value || 0);

  if (invDiscValue.gt(0)) {
    if (invDiscType === 'percentage') {
      invoiceDiscountAmount = taxableBase.mul(invDiscValue).div(100);
    } else {
      invoiceDiscountAmount = invDiscValue.gt(taxableBase) ? taxableBase : invDiscValue;
    }
    taxableBase = taxableBase.minus(invoiceDiscountAmount);

    // Scale down tax amounts proportionally for invoice discount
    const denominator = subtotal.minus(lineItemDiscountTotal);
    if (denominator.gt(0)) {
      const ratio = taxableBase.div(denominator);
      cgstTotal = cgstTotal.mul(ratio);
      sgstTotal = sgstTotal.mul(ratio);
      igstTotal = igstTotal.mul(ratio);
      cessTotal = cessTotal.mul(ratio);
    }
  }

  const discountTotal = lineItemDiscountTotal.plus(invoiceDiscountAmount);
  const taxTotal      = cgstTotal.plus(sgstTotal).plus(igstTotal).plus(cessTotal);

  // ── Step 3: Additional charges ────────────────────────────────────────
  let additionalChargesTotal = toD(shippingCharge);
  for (const charge of additionalCharges) {
    additionalChargesTotal = additionalChargesTotal.plus(toD(charge.amount || 0));
  }

  // ── Step 4: Grand total ───────────────────────────────────────────────
  const grandTotalBeforeTDS = taxableBase.plus(taxTotal).plus(additionalChargesTotal);

  const tdsAmount  = grandTotalBeforeTDS.mul(toD(tdsRate)).div(100);
  const grandTotal = grandTotalBeforeTDS.minus(tdsAmount);

  // ── Step 5: Tax breakdown ─────────────────────────────────────────────
  const taxBreakdown = [];
  if (isINR) {
    if (cgstTotal.gt(0)) taxBreakdown.push({ taxName: 'CGST', taxRate: null, taxableAmount: round2(taxableBase), taxAmount: round2(cgstTotal) });
    if (sgstTotal.gt(0)) taxBreakdown.push({ taxName: 'SGST', taxRate: null, taxableAmount: round2(taxableBase), taxAmount: round2(sgstTotal) });
    if (igstTotal.gt(0)) taxBreakdown.push({ taxName: 'IGST', taxRate: null, taxableAmount: round2(taxableBase), taxAmount: round2(igstTotal) });
    if (cessTotal.gt(0)) taxBreakdown.push({ taxName: 'Cess', taxRate: null, taxableAmount: round2(taxableBase), taxAmount: round2(cessTotal) });
  } else {
    // Non-INR: single generic "Tax" line (igstTotal holds generic rate amounts)
    if (igstTotal.gt(0)) {
      taxBreakdown.push({ taxName: 'Tax', taxRate: null, taxableAmount: round2(taxableBase), taxAmount: round2(igstTotal) });
    }
  }

  return {
    subtotal:              round2(subtotal),
    lineItemDiscountTotal: round2(lineItemDiscountTotal),
    invoiceDiscount: {
      type:   invDiscType,
      value:  round2(invDiscValue),
      amount: round2(invoiceDiscountAmount),
    },
    discountTotal:          round2(discountTotal),
    taxableAmount:          round2(taxableBase),
    taxBreakdown,
    cgstTotal:              round2(cgstTotal),
    sgstTotal:              round2(sgstTotal),
    igstTotal:              round2(igstTotal),
    cessTotal:              round2(cessTotal),
    taxTotal:               round2(taxTotal),
    tdsRate,
    tdsAmount:              round2(tdsAmount),
    shippingCharge:         round2(toD(shippingCharge)),
    additionalChargesTotal: round2(additionalChargesTotal),
    grandTotal:             round2(grandTotal),
  };
};

/**
 * Recalculate balanceDue after a payment is recorded.
 */
const calculateBalanceDue = (grandTotal, amountPaid) => {
  const balance = toD(grandTotal).minus(toD(amountPaid));
  return round2(balance.lt(0) ? toD(0) : balance);
};

/**
 * Calculate the due date from invoice date + payment terms.
 */
const calculateDueDate = (invoiceDate, paymentTerms) => {
  const date = new Date(invoiceDate);
  const termMap = {
    'Net 15': 15, 'Net 30': 30, 'Net 45': 45, 'Net 60': 60, 'Due on Receipt': 0,
  };
  const days = termMap[paymentTerms] ?? 30;
  date.setDate(date.getDate() + days);
  return date;
};

module.exports = { calculateLineItem, calculateInvoiceTotals, calculateBalanceDue, calculateDueDate };
