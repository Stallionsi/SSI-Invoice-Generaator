/**
 * Frontend Invoice Calculation Utilities
 *
 * Mirrors backend calculation logic for live previews.
 * Authoritative math is done server-side with Decimal.js.
 *
 * Currency Rules:
 *  - INR  → full GST (CGST/SGST/IGST based on gstType)
 *  - USD  → tax = 0 always
 *  - Other foreign currencies → generic single-rate tax when gstType ≠ 'none'
 */

// ─── Single Line Item ──────────────────────────────────────────────────────
/**
 * @param {Object}      item            - line item values from the form
 * @param {Object}      opts
 * @param {number|null} opts.globalUnitPrice - if provided, overrides item.unitPrice
 * @param {string}      opts.currency        - ISO currency code
 * @param {string}      opts.gstType         - 'intrastate'|'interstate'|'none'
 */
export function calcLineItem(item, opts = {}) {
  const { globalUnitPrice = null, currency = 'INR', gstType = 'none' } = opts;

  const qty   = parseFloat(item.quantity)   || 0;
  const price = globalUnitPrice !== null
    ? (parseFloat(globalUnitPrice) || 0)
    : (parseFloat(item.unitPrice)  || 0);

  const gross = qty * price;

  // Discount (backward-compat with old invoices; new ones have value=0)
  let discountAmount = 0;
  if (item.discount?.value) {
    const dv = parseFloat(item.discount.value) || 0;
    discountAmount = item.discount.type === 'percentage' ? gross * (dv / 100) : dv;
  }

  const taxable = gross - discountAmount;

  // Tax: USD always 0; gstType 'none' always 0; INR uses taxRate; other foreign uses taxRate
  const isUSD  = currency === 'USD';
  const noTax  = isUSD || gstType === 'none';
  const taxRate = noTax ? 0 : (parseFloat(item.taxRate) || 0);
  const tax     = taxable * (taxRate / 100);
  const lineTotal = taxable + tax;

  return { gross, discountAmount, taxable, tax, lineTotal, price };
}

// ─── Invoice Totals ────────────────────────────────────────────────────────
/**
 * @param {Array}       lineItems
 * @param {string}      gstType
 * @param {Object|null} invoiceDiscount  - { type: 'percentage'|'fixed', value: number }
 * @param {string}      currency
 * @param {number|null} globalUnitPrice  - if set, used for every line item price
 */
export function calcInvoiceTotals(
  lineItems = [],
  gstType = 'none',
  invoiceDiscount = null,
  currency = 'INR',
  globalUnitPrice = null,
) {
  const isINR = currency === 'INR';
  const opts  = { globalUnitPrice, currency, gstType };

  let subtotal      = 0;
  let discountTotal = 0;
  let taxableAmount = 0;
  let totalTax      = 0;

  lineItems.forEach((item) => {
    const r = calcLineItem(item, opts);
    subtotal      += r.gross;
    discountTotal += r.discountAmount;
    taxableAmount += r.taxable;
    totalTax      += r.tax;
  });

  // Invoice-level discount
  let invDiscount = 0;
  if (invoiceDiscount?.value) {
    const dv = parseFloat(invoiceDiscount.value) || 0;
    invDiscount = invoiceDiscount.type === 'percentage'
      ? taxableAmount * (dv / 100)
      : Math.min(dv, taxableAmount);

    // Scale tax proportionally after invoice discount
    const denominator = taxableAmount;
    taxableAmount  -= invDiscount;
    discountTotal  += invDiscount;
    totalTax        = denominator > 0 ? totalTax * (taxableAmount / denominator) : 0;
  }

  // Split tax for INR display
  let cgstTotal = 0, sgstTotal = 0, igstTotal = 0, taxTotal = 0;

  if (isINR) {
    if (gstType === 'intrastate') {
      cgstTotal = totalTax / 2;
      sgstTotal = totalTax / 2;
    } else if (gstType === 'interstate') {
      igstTotal = totalTax;
    }
    // gstType 'none' → all zeros
  } else {
    // Non-INR: single "Tax" line (0 for USD per spec)
    taxTotal = totalTax;
  }

  const grandTotal = taxableAmount + totalTax;

  return {
    subtotal,
    discountTotal,
    taxableAmount,
    cgstTotal,
    sgstTotal,
    igstTotal,
    taxTotal,
    grandTotal,
  };
}

// ─── Currency Formatting ───────────────────────────────────────────────────
export function fmtCurrency(amount, currency = 'INR') {
  const locale = currency === 'INR' ? 'en-IN' : 'en-US';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount || 0);
}

// ─── Invoice Date Formatting ───────────────────────────────────────────────
export function fmtDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

// ─── Line-item Date Formatting ─────────────────────────────────────────────
/**
 * Format a line-item service date.
 * INR/India → DD/MM/YYYY   USD/others → MM/DD/YYYY
 */
export function fmtLineItemDate(dateStr, currency = 'INR') {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const dd   = String(d.getDate()).padStart(2, '0');
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return currency === 'INR' ? `${dd}/${mm}/${yyyy}` : `${mm}/${dd}/${yyyy}`;
}

/**
 * Build a human-readable date range string for a line item description.
 * e.g. "03/09/2026 To 03/15/2026"
 */
export function fmtDateRange(fromDate, toDate, currency = 'INR') {
  const from = fmtLineItemDate(fromDate, currency);
  const to   = fmtLineItemDate(toDate,   currency);
  if (from && to)   return `${from} To ${to}`;
  if (from)         return `From ${from}`;
  return '';
}
