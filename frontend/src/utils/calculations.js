/**
 * Mirror of backend calculation logic for live invoice previews.
 * Uses native JS (adequate for display; backend does authoritative math with Decimal.js).
 */

export function calcLineItem(item, applyTax = true) {
  const qty = parseFloat(item.quantity) || 0;
  const price = parseFloat(item.unitPrice) || 0;
  const taxRate = applyTax ? (parseFloat(item.taxRate) || 0) : 0;
  const gross = qty * price;

  let discountAmount = 0;
  if (item.discount?.value) {
    const dv = parseFloat(item.discount.value) || 0;
    discountAmount = item.discount.type === 'percentage' ? gross * (dv / 100) : dv;
  }

  const taxable = gross - discountAmount;
  const tax = taxable * (taxRate / 100);
  const lineTotal = taxable + tax;
  return { gross, discountAmount, taxable, tax, lineTotal };
}

export function calcInvoiceTotals(lineItems = [], gstType = 'none', invoiceDiscount = null, currency = 'INR') {
  const isINR = currency === 'INR';

  let subtotal = 0;
  let discountTotal = 0;
  let taxableAmount = 0;
  let totalTax = 0;

  // Always apply tax rate — non-INR gets generic tax, INR gets GST
  lineItems.forEach((item) => {
    const r = calcLineItem(item, true);
    subtotal += r.gross;
    discountTotal += r.discountAmount;
    taxableAmount += r.taxable;
    totalTax += r.tax;
  });

  // Invoice-level discount — scale tax proportionally for all currencies
  let invDiscount = 0;
  if (invoiceDiscount?.value) {
    const dv = parseFloat(invoiceDiscount.value) || 0;
    invDiscount = invoiceDiscount.type === 'percentage' ? taxableAmount * (dv / 100) : dv;
    taxableAmount -= invDiscount;
    discountTotal += invDiscount;
    totalTax = totalTax * (1 - invDiscount / (taxableAmount + invDiscount || 1));
  }

  let cgstTotal = 0;
  let sgstTotal = 0;
  let igstTotal = 0;
  let taxTotal  = 0; // generic tax for non-INR currencies

  if (isINR) {
    if (gstType === 'intrastate') {
      cgstTotal = totalTax / 2;
      sgstTotal = totalTax / 2;
    } else if (gstType === 'interstate') {
      igstTotal = totalTax;
    }
    // gstType 'none' → no GST rows shown
  } else {
    // Non-INR: single generic tax line, no GST labels
    taxTotal = totalTax;
  }

  const grandTotal = taxableAmount + totalTax;
  return { subtotal, discountTotal, taxableAmount, cgstTotal, sgstTotal, igstTotal, taxTotal, grandTotal };
}

export function fmtCurrency(amount, currency = 'INR') {
  // Use en-IN locale (Indian grouping: 1,00,000) only for INR.
  // All other currencies use en-US locale so USD/EUR/GBP etc. format correctly.
  const locale = currency === 'INR' ? 'en-IN' : 'en-US';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount || 0);
}

export function fmtDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}
