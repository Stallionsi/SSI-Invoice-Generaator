import { useRef, useState, useEffect } from 'react';
import { Calendar, X } from 'lucide-react';
import { fmtLineItemDate } from '../../utils/calculations';

/**
 * DateRangePicker — compact inline From / To date picker for line items.
 *
 * Props:
 *   fromDate   {string}   ISO date "YYYY-MM-DD"
 *   toDate     {string}   ISO date "YYYY-MM-DD"
 *   onFromChange (val) => void
 *   onToChange   (val) => void
 *   currency   {string}   ISO currency (controls display format)
 *   error      {string}   optional validation message
 *   disabled   {boolean}
 */
export default function DateRangePicker({
  fromDate = '',
  toDate   = '',
  onFromChange,
  onToChange,
  currency = 'INR',
  error,
  disabled = false,
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  // Close popover on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (!containerRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const hasRange = fromDate || toDate;
  const displayFrom = fmtLineItemDate(fromDate, currency);
  const displayTo   = fmtLineItemDate(toDate,   currency);

  const handleClear = (e) => {
    e.stopPropagation();
    onFromChange?.('');
    onToChange?.('');
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger chip */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={[
          'flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium border transition-colors w-full',
          hasRange
            ? 'border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
            : 'border-gray-200 bg-gray-50 text-gray-500 hover:bg-gray-100 hover:border-gray-300',
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
        ].join(' ')}
      >
        <Calendar className="w-3 h-3 shrink-0" />
        <span className="truncate flex-1 text-left">
          {hasRange
            ? (displayFrom && displayTo)
                ? `${displayFrom} → ${displayTo}`
                : displayFrom || displayTo
            : 'Set date range'}
        </span>
        {hasRange && !disabled && (
          <X
            className="w-3 h-3 shrink-0 text-gray-400 hover:text-red-500"
            onClick={handleClear}
          />
        )}
      </button>

      {/* Popover */}
      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl p-4 min-w-[280px]">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
              Service Period
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* From date */}
            <div>
              <label className="block text-xs text-gray-500 font-medium mb-1">
                From Date
              </label>
              <input
                type="date"
                value={fromDate}
                max={toDate || undefined}
                disabled={disabled}
                onChange={(e) => onFromChange?.(e.target.value)}
                className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 disabled:opacity-50 bg-white"
              />
            </div>

            {/* To date */}
            <div>
              <label className="block text-xs text-gray-500 font-medium mb-1">
                To Date
              </label>
              <input
                type="date"
                value={toDate}
                min={fromDate || undefined}
                disabled={disabled}
                onChange={(e) => onToChange?.(e.target.value)}
                className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 disabled:opacity-50 bg-white"
              />
            </div>
          </div>

          {/* Validation */}
          {error && (
            <p className="mt-2 text-xs text-red-500">{error}</p>
          )}

          {/* Preview */}
          {fromDate && toDate && (
            <div className="mt-3 p-2 bg-indigo-50 rounded-lg">
              <p className="text-xs text-indigo-600 font-medium">
                {displayFrom} → {displayTo}
              </p>
            </div>
          )}

          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-3 py-1.5 text-xs font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
