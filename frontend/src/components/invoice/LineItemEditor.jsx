import { useEffect } from 'react';
import { useFieldArray, useWatch, useFormContext } from 'react-hook-form';
import { Plus, Trash2, DollarSign, RotateCcw } from 'lucide-react';
import { calcLineItem, fmtCurrency, fmtDateRange } from '../../utils/calculations';
import DateRangePicker from './DateRangePicker';

// ─── Default Item ──────────────────────────────────────────────────────────
const makeDefaultItem = (globalUnitPrice = 0, isINR = true) => ({
  description: '',
  quantity:    1,
  unitPrice:   globalUnitPrice,
  taxRate:     isINR ? 18 : 0,
  fromDate:    '',
  toDate:      '',
  discount:    { type: 'percentage', value: 0 },
});

// ─── Row-level date cleaner ────────────────────────────────────────────────
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
function LineItemRow({ index, remove, isLast, currency, isINR, globalUnitPrice, errors, register, setValue }) {
  useAutoDescription(index);

  const vals = useWatch({ name: `lineItems.${index}` }) || {};
  const fromDate = vals.fromDate || '';
  const toDate   = vals.toDate   || '';

  const itemPrice = parseFloat(vals.unitPrice) || 0;
  const gupNum    = parseFloat(globalUnitPrice) || 0;
  // Item differs from global when global is set and prices don't match
  const isOverridden = gupNum > 0 && Math.abs(itemPrice - gupNum) > 0.001;

  // Calculate line total using item's own unitPrice (no global override)
  const { lineTotal } = calcLineItem(vals, {
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

      {/* Second row: Qty | Unit Price | Tax | Period | Total */}
      <div className="mt-3 grid grid-cols-2 sm:grid-cols-5 gap-3 items-end">

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

        {/* Unit Price — individual, overrides global for this item */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-gray-400 font-medium">Unit Price</label>
            {isOverridden && (
              <button
                type="button"
                title="Reset to global price"
                onClick={() => setValue(`lineItems.${index}.unitPrice`, gupNum, { shouldDirty: true })}
                className="flex items-center gap-0.5 text-[10px] font-semibold text-amber-600 hover:text-amber-700 transition-colors"
              >
                <RotateCcw className="w-2.5 h-2.5" />
                <span>global</span>
              </button>
            )}
          </div>
          <input
            {...register(`lineItems.${index}.unitPrice`, { valueAsNumber: true })}
            type="number"
            min="0"
            step="0.01"
            className={`input text-sm text-right font-mono transition-colors ${
              isOverridden
                ? 'border-amber-300 bg-amber-50/40 focus:ring-amber-300'
                : 'bg-white'
            }`}
            placeholder="0.00"
          />
          {isOverridden && (
            <p className="text-[10px] text-amber-500 mt-0.5 text-right">custom price</p>
          )}
        </div>

        {/* Tax % */}
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

        {/* Service Period */}
        <div>
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

  // When globalUnitPrice changes → bulk-update ALL items.
  // Only fires when gupNum > 0 so that loading an existing invoice with
  // globalUnitPrice = 0 does NOT wipe the per-item prices already in the form.
  useEffect(() => {
    if (gupNum > 0) {
      fields.forEach((_, i) => {
        setValue(`lineItems.${i}.unitPrice`, gupNum, { shouldDirty: false });
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gupNum, fields.length]);

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
              — sets all items at once · override per-item below
            </span>
          </label>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-indigo-800">{currency}</span>
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
            <p className="text-base font-bold text-indigo-700">{fmtCurrency(gupNum, currency)}</p>
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

      {/* ── Column header hint ─────────────────────────────────────────── */}
      <div className="hidden sm:grid grid-cols-5 gap-3 px-4 text-[10px] font-semibold uppercase tracking-wider text-gray-400 pl-8">
        <span>Description</span>
        <span className="text-right">Qty</span>
        <span className="text-right">Unit Price</span>
        <span className="text-right">Tax %</span>
        <span className="text-right">Amount</span>
      </div>

      {/* ── Line Items ────────────────────────────────────────────────── */}
      <div className="space-y-3 pl-4">
        {fields.map((field, i) => (
          <LineItemRow
            key={field.id}
            index={i}
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
