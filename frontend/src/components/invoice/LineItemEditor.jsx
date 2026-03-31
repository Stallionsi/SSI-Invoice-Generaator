import { useFieldArray, useWatch } from 'react-hook-form';
import { Plus, Trash2 } from 'lucide-react';
import { calcLineItem, fmtCurrency } from '../../utils/calculations';
import { useMediaQuery } from '../../hooks/useMediaQuery';

const defaultItem = {
  description: '',
  quantity:    1,
  unitPrice:   0,
  taxRate:     18,
  discount:    { type: 'percentage', value: 0 },
};

export default function LineItemEditor({ control, register, errors, currency = 'INR', isINR = true }) {
  const { fields, append, remove } = useFieldArray({ control, name: 'lineItems' });
  const lineItems = useWatch({ control, name: 'lineItems' });
  const isDesktop = useMediaQuery('(min-width: 768px)');

  return (
    <div className="space-y-3">
      {/* ── Desktop table (md+) ── */}
      {isDesktop && <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead>
            <tr className="text-xs text-gray-500 uppercase border-b border-gray-200">
              <th className="text-left py-2 pr-3 font-semibold w-full">Description</th>
              <th className="text-right py-2 px-2 font-semibold whitespace-nowrap">Qty</th>
              <th className="text-right py-2 px-2 font-semibold whitespace-nowrap">Unit Price</th>
              <th className="text-right py-2 px-2 font-semibold whitespace-nowrap">Disc %</th>
              {isINR && <th className="text-right py-2 px-2 font-semibold whitespace-nowrap">Tax %</th>}
              <th className="text-right py-2 pl-2 font-semibold whitespace-nowrap">Total</th>
              <th className="py-2 pl-2 w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {fields.map((field, i) => {
              const vals = lineItems?.[i] || {};
              const { lineTotal } = calcLineItem(vals);
              return (
                <tr key={field.id}>
                  <td className="py-2 pr-3">
                    <input
                      {...register(`lineItems.${i}.description`)}
                      className="input"
                      placeholder="Service description"
                    />
                    {errors.lineItems?.[i]?.description && (
                      <p className="text-red-500 text-xs mt-0.5">Required</p>
                    )}
                  </td>
                  <td className="py-2 px-2">
                    <input {...register(`lineItems.${i}.quantity`, { valueAsNumber: true })}
                      type="number" min="0" step="0.01" className="input w-16 text-right" />
                  </td>
                  <td className="py-2 px-2">
                    <input {...register(`lineItems.${i}.unitPrice`, { valueAsNumber: true })}
                      type="number" min="0" step="0.01" className="input w-24 text-right" />
                  </td>
                  <td className="py-2 px-2">
                    <input {...register(`lineItems.${i}.discount.value`, { valueAsNumber: true })}
                      type="number" min="0" max="100" step="0.01" className="input w-16 text-right" />
                  </td>
                  {isINR && (
                    <td className="py-2 px-2">
                      <input {...register(`lineItems.${i}.taxRate`, { valueAsNumber: true })}
                        type="number" min="0" step="0.01" className="input w-16 text-right" />
                    </td>
                  )}
                  <td className="py-2 pl-2 text-right font-medium whitespace-nowrap text-gray-700">
                    {fmtCurrency(lineTotal, currency)}
                  </td>
                  <td className="py-2 pl-2">
                    <button type="button" onClick={() => remove(i)} disabled={fields.length === 1}
                      className="text-gray-400 hover:text-red-500 disabled:opacity-30">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>}

      {/* ── Mobile card layout (< md) ── */}
      {!isDesktop && <div className="space-y-3">
        {fields.map((field, i) => {
          const vals = lineItems?.[i] || {};
          const { lineTotal } = calcLineItem(vals);
          return (
            <div key={field.id} className="border border-gray-200 rounded-lg p-3 space-y-2 bg-white">
              <div className="flex items-start gap-2">
                <div className="flex-1">
                  <label className="text-xs text-gray-500 uppercase font-semibold mb-1 block">Description</label>
                  <input
                    {...register(`lineItems.${i}.description`)}
                    className="input"
                    placeholder="Service description"
                  />
                  {errors.lineItems?.[i]?.description && (
                    <p className="text-red-500 text-xs mt-0.5">Required</p>
                  )}
                </div>
                <button type="button" onClick={() => remove(i)} disabled={fields.length === 1}
                  className="mt-5 text-gray-400 hover:text-red-500 disabled:opacity-30 shrink-0">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-500 uppercase font-semibold mb-1 block">Qty</label>
                  <input {...register(`lineItems.${i}.quantity`, { valueAsNumber: true })}
                    type="number" min="0" step="0.01" className="input text-right" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 uppercase font-semibold mb-1 block">Unit Price</label>
                  <input {...register(`lineItems.${i}.unitPrice`, { valueAsNumber: true })}
                    type="number" min="0" step="0.01" className="input text-right" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 uppercase font-semibold mb-1 block">Disc %</label>
                  <input {...register(`lineItems.${i}.discount.value`, { valueAsNumber: true })}
                    type="number" min="0" max="100" step="0.01" className="input text-right" />
                </div>
                {isINR && (
                  <div>
                    <label className="text-xs text-gray-500 uppercase font-semibold mb-1 block">Tax %</label>
                    <input {...register(`lineItems.${i}.taxRate`, { valueAsNumber: true })}
                      type="number" min="0" step="0.01" className="input text-right" />
                  </div>
                )}
              </div>

              <div className="flex justify-end text-sm font-semibold text-gray-800 pt-1 border-t border-gray-100">
                <span className="text-gray-400 mr-2">Total:</span>
                {fmtCurrency(lineTotal, currency)}
              </div>
            </div>
          );
        })}
      </div>}

      <button
        type="button"
        onClick={() => append({ ...defaultItem, discount: { type: 'percentage', value: 0 } })}
        className="btn btn-secondary btn-sm"
      >
        <Plus className="w-3.5 h-3.5" /> Add Line Item
      </button>
    </div>
  );
}
