import { useEffect } from 'react';
import { useFieldArray, useWatch, useFormContext } from 'react-hook-form';
import { Plus, Trash2, DollarSign } from 'lucide-react';
import { calcLineItem, fmtCurrency, fmtDateRange } from '../../utils/calculations';
import DateRangePicker from './DateRangePicker';

// ─── Default Item ──────────────────────────────────────────────────────────
const makeDefaultItem = (globalUnitPrice = 0, isINR = true) => ({
  description: '',
  quantity:    1,
  unitPrice:   globalUnitPrice,   // mirrored from global
  taxRate:     isINR ? 18 : 0,
  fromDate:    '',
  toDate:      '',
  discount:    { type: 'percentage', value: 0 }, // kept for backward compat
});

// ─── Row-level date cleaner ────────────────────────────────────────────────
// Strips any previously auto-inserted date range from the description so old
// invoices that stored "DESC, 04/13/2026 To 04/19/2026" are cleaned up.
// Dates are intentionally NOT re-appended — the 📅 chip below the description
// field is the only place they appear in the UI.
function useAutoDescription(index) {
  const { setValue, getValues } = useFormContext();

  const fromDate = useWatch({ name: `lineItems.${index}.fromDate` });
  const toDate   = useWatch({ name: `lineItems.${index}.toDate` });

  useEffect(() => {
    const DATE_RANGE_SUFFIX = /,?\s*(?:\d{2}\/\d{2}\/\d{4}\s+to\s+\d{2}\/\d{2}\/\d{4}|\bfrom\s+\d{2}\/\d{2}\/\d{4})/i;
    const currentDesc = getValues(`lineItems.${index}.description`) || '';
    const cleaned     = currentDesc.replace(DATE_RANGE_SUFFIX, '').trim();
    if (cleaned !== currentDesc) {
      setValue(`lineItems.${index}.description`, cleaned, { shouldDirty: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromDate, toDate]);
}

// ─── Single Row ────────────────────────────────────────────────────────────
function LineItemRow({ index, field, remove, isLast, currency, isINR, globalUnitPrice, errors, register, setValue }) {
  useAutoDescription(index);

  const vals = useWatch({ name: `lineItems.${index}` }) || {};
  const fromDate = vals.fromDate || '';
  const toDate   = vals.toDate   || '';

  const { lineTotal } = calcLineItem(vals, {
    globalUnitPrice: parseFloat(globalUnitPrice) || 0,
    currency,
    gstType: isINR ? 'intrastate' : 'none',
  });

  return (
    <div className="group relative bg-white border border-gray-100 rounded-xl p-4 hover:border-indigo-100 hover:shadow-sm transition-all duration-200">
      {/* Row number badge */}
      <div className="absolute -left-3 top-4 w-6 h-6 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-xs font-bold select-none">
        {index + 1}
      </div>

      <div className="flex items-start gap-2">
        {/* Description */}
        <div className="flex-1 min-w-0">
          <label className="text-xs text-gray-400 font-medium mb-1 block">Description</label>
          <input
            {...register(`lineItems.${index}.description`)}
            className="input text-sm"
            placeholder="e.g. Scott & Associates PHASE 1"
          />
          {errors?.lineItems?.[index]?.description && (
            <p className="text-red-500 text-xs mt-0.5">Required</p>
          )}
          {/* Date range display chip (read-only preview when dates set) */}
          {(fromDate || toDate) && (
            <p className="mt-1 text-xs text-indigo-500 font-medium">
              📅 {fmtDateRange(fromDate, toDate, currency)}
            </p>
          )}
        </div>

        {/* Delete */}
        <button
          type="button"
          onClick={() => remove(index)}
          disabled={isLast}
          className="mt-6 p-1.5 text-gray-300 hover:text-red-500 disabled:opacity-20 disabled:cursor-not-allowed transition-colors rounded-lg hover:bg-red-50"
          title="Remove line item"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Second row: Qty + Tax + Date range + Total */}
      <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
        {/* Quantity */}
        <div>
          <label className="text-xs text-gray-400 font-medium mb-1 block">Qty</label>
          <input
            {...register(`lineItems.${index}.quantity`, { valueAsNumber: true })}
            type="number"
            min="0"
            step="any"
            className="input text-sm text-right"
          />
        </div>

        {/* Tax % — hidden for USD */}
        {isINR ? (
          <div>
            <label className="text-xs text-gray-400 font-medium mb-1 block">Tax %</label>
            <input
              {...register(`lineItems.${index}.taxRate`, { valueAsNumber: true })}
              type="number"
              min="0"
              max="100"
              step="0.01"
              className="input text-sm text-right"
            />
          </div>
        ) : (
          <div>
            <label className="text-xs text-gray-400 font-medium mb-1 block">Tax %</label>
            <div className="input text-sm text-right bg-gray-50 text-gray-400 select-none cursor-not-allowed">
              0% (N/A)
            </div>
          </div>
        )}

        {/* Date range picker */}
        <div className="sm:col-span-1">
          <label className="text-xs text-gray-400 font-medium mb-1 block">Service Period</label>
          <DateRangePicker
            fromDate={fromDate}
            toDate={toDate}
            onFromChange={(v) => setValue(`lineItems.${index}.fromDate`, v, { shouldDirty: true })}
            onToChange={(v)   => setValue(`lineItems.${index}.toDate`,   v, { shouldDirty: true })}
            currency={currency}
          />
        </div>

        {/* Line total */}
        <div className="text-right">
          <label className="text-xs text-gray-400 font-medium mb-1 block">Amount</label>
          <div className="text-sm font-bold text-gray-800 py-2">
            {fmtCurrency(lineTotal, currency)}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────
export default function LineItemEditor({
  control,
  register,
  errors,
  setValue,
  currency = 'INR',
  isINR    = true,
}) {
  const { fields, append, remove } = useFieldArray({ control, name: 'lineItems' });
  const globalUnitPrice = useWatch({ control, name: 'globalUnitPrice' });
  const gupNum = parseFloat(globalUnitPrice) || 0;

  // Sync globalUnitPrice → every line item's unitPrice (keeps backend totals accurate)
  useEffect(() => {
    if (gupNum >= 0) {
      fields.forEach((_, i) => {
        setValue(`lineItems.${i}.unitPrice`, gupNum, { shouldDirty: false });
        // When currency is not INR, force taxRate = 0
        if (!isINR) {
          setValue(`lineItems.${i}.taxRate`, 0, { shouldDirty: false });
        }
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gupNum, isINR, fields.length]);

  // When currency flips to non-INR, zero out all taxRates
  useEffect(() => {
    if (!isINR) {
      fields.forEach((_, i) => {
        setValue(`lineItems.${i}.taxRate`, 0, { shouldDirty: false });
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isINR]);

  return (
    <div className="space-y-4">

      {/* ── Global Unit Price ──────────────────────────────────────────── */}
      <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-100 rounded-xl">
        <div className="flex items-center justify-center w-8 h-8 bg-indigo-600 rounded-lg shrink-0">
          <DollarSign className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1">
          <label className="text-xs font-semibold text-indigo-700 block mb-0.5">
            Global Unit Price
            <span className="ml-2 font-normal text-indigo-500">
              — applied to all line items
            </span>
          </label>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-indigo-800">
              {currency}
            </span>
            <input
              {...register('globalUnitPrice', { valueAsNumber: true })}
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              className="input w-40 text-right font-mono font-semibold text-indigo-900 bg-white border-indigo-200 focus:ring-indigo-300"
            />
          </div>
        </div>
        {gupNum > 0 && (
          <div className="text-right shrink-0">
            <p className="text-xs text-indigo-500 font-medium">Per unit</p>
            <p className="text-base font-bold text-indigo-700">
              {fmtCurrency(gupNum, currency)}
            </p>
          </div>
        )}
      </div>

      {/* ── Non-INR tax notice ─────────────────────────────────────────── */}
      {!isINR && (
        <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700 font-medium">
          <span>🔒</span>
          Tax is set to <strong>0%</strong> for {currency} invoices — no indirect tax applies.
        </div>
      )}

      {/* ── Line Items ────────────────────────────────────────────────── */}
      <div className="space-y-3 pl-4">
        {fields.map((field, i) => (
          <LineItemRow
            key={field.id}
            index={i}
            field={field}
            remove={remove}
            isLast={fields.length === 1}
            currency={currency}
            isINR={isINR}
            globalUnitPrice={gupNum}
            errors={errors}
            register={register}
            setValue={setValue}
          />
        ))}
      </div>

      {/* ── Add button ─────────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => append(makeDefaultItem(gupNum, isINR))}
        className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-indigo-600 border-2 border-dashed border-indigo-200 rounded-xl hover:border-indigo-400 hover:bg-indigo-50 transition-all duration-200 w-full justify-center"
      >
        <Plus className="w-4 h-4" />
        Add Line Item
      </button>
    </div>
  );
}
