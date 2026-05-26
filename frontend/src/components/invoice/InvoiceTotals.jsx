import { fmtCurrency } from '../../utils/calculations';

/**
 * InvoiceTotals — renders the breakdown summary panel.
 *
 * Props:
 *  totals   {Object}  output of calcInvoiceTotals()
 *  currency {string}  ISO currency code
 */
export default function InvoiceTotals({ totals = {}, currency = 'INR' }) {
  const isINR = currency === 'INR';

  const {
    subtotal       = 0,
    discountTotal  = 0,
    taxableAmount  = 0,
    cgstTotal      = 0,
    sgstTotal      = 0,
    igstTotal      = 0,
    taxTotal       = 0,
    grandTotal     = 0,
  } = totals;

  // ── Build display rows ────────────────────────────────────────────────────
  const rows = [];

  rows.push({ label: 'Subtotal', value: subtotal, style: 'normal', show: true });

  if (discountTotal > 0) {
    rows.push({ label: 'Discount', value: -discountTotal, style: 'discount', show: true });
  }

  if (discountTotal > 0 && subtotal !== taxableAmount) {
    rows.push({ label: 'Taxable Amount', value: taxableAmount, style: 'normal', show: true });
  }

  if (isINR) {
    if (cgstTotal > 0) rows.push({ label: 'CGST',  value: cgstTotal, style: 'tax', show: true });
    if (sgstTotal > 0) rows.push({ label: 'SGST',  value: sgstTotal, style: 'tax', show: true });
    if (igstTotal > 0) rows.push({ label: 'IGST',  value: igstTotal, style: 'tax', show: true });
  } else if (taxTotal > 0) {
    // Non-INR generic tax (non-USD only; USD taxTotal is always 0)
    rows.push({ label: 'Tax', value: taxTotal, style: 'tax', show: true });
  }

  const visibleRows = rows.filter((r) => r.show);

  const styleMap = {
    normal:   'text-gray-600',
    discount: 'text-emerald-600 font-medium',
    tax:      'text-gray-500',
  };

  return (
    <div className="w-full max-w-xs">
      <div className="bg-gray-50 border border-gray-100 rounded-xl overflow-hidden">

        {/* Breakdown rows */}
        {visibleRows.length > 0 && (
          <div className="px-4 py-3 space-y-2">
            {visibleRows.map((row) => (
              <div key={row.label} className={`flex justify-between text-sm ${styleMap[row.style] || 'text-gray-600'}`}>
                <span>{row.label}</span>
                <span className="font-medium tabular-nums">
                  {fmtCurrency(row.value, currency)}
                </span>
              </div>
            ))}

            {/* USD tax-free notice */}
            {!isINR && taxTotal === 0 && (
              <div className="flex items-center gap-1.5 text-xs text-amber-600 mt-1 pt-1 border-t border-gray-100">
                <span>🔒</span>
                <span>No tax — {currency} invoice</span>
              </div>
            )}
          </div>
        )}

        {/* Grand Total bar */}
        <div className="bg-indigo-700 px-4 py-3 flex justify-between items-center">
          <span className="text-sm font-semibold text-white">Grand Total</span>
          <span className="text-base font-bold text-white tabular-nums">
            {fmtCurrency(grandTotal, currency)}
          </span>
        </div>
      </div>
    </div>
  );
}
