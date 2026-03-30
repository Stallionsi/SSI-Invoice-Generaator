import { fmtCurrency } from '../../utils/calculations';

export default function InvoiceTotals({ totals, currency = 'INR' }) {
  const isINR = currency === 'INR';
  const {
    subtotal = 0,
    discountTotal = 0,
    taxableAmount = 0,
    cgstTotal = 0,
    sgstTotal = 0,
    igstTotal = 0,
    taxTotal  = 0,
    grandTotal = 0,
  } = totals;

  const rows = [
    { label: 'Subtotal',       value: subtotal,       show: true },
    { label: 'Discount',       value: -discountTotal,  show: discountTotal > 0 },
    { label: 'Taxable Amount', value: taxableAmount,   show: discountTotal > 0 },
    // INR: show GST breakdown
    { label: 'CGST',           value: cgstTotal,       show: isINR && cgstTotal > 0 },
    { label: 'SGST',           value: sgstTotal,       show: isINR && sgstTotal > 0 },
    { label: 'IGST',           value: igstTotal,       show: isINR && igstTotal > 0 },
    // Non-INR: show single "Tax" line
    { label: 'Tax',            value: taxTotal,        show: !isINR && taxTotal > 0 },
  ];

  return (
    <div className="ml-auto w-64">
      <div className="space-y-1.5 text-sm">
        {rows.filter((r) => r.show).map((r) => (
          <div key={r.label} className="flex justify-between text-gray-600">
            <span>{r.label}</span>
            <span>{fmtCurrency(r.value, currency)}</span>
          </div>
        ))}
        <div className="border-t border-gray-200 pt-2 flex justify-between font-bold text-gray-900 text-base">
          <span>Grand Total</span>
          <span>{fmtCurrency(grandTotal, currency)}</span>
        </div>
      </div>
    </div>
  );
}
