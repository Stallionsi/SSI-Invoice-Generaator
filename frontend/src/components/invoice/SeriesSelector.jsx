import { useQuery } from '@tanstack/react-query';
import { Tag } from 'lucide-react';
import { getInvoiceSeries } from '../../api/invoiceSeries.api';
import { useActiveCompany } from '../../hooks/useActiveCompany';

/**
 * SeriesSelector — Dropdown to choose which invoice series to use.
 *
 * Props:
 *   value          - current seriesId ('' = company default)
 *   onChange       - (seriesId: string) => void
 *   onClientLink   - (clientId: string | null) => void  — called when a series
 *                    with a linked client is selected (or cleared); lets
 *                    CreateInvoice auto-fill the client field
 *   disabled       - bool (e.g. when editing a sent invoice)
 */
export default function SeriesSelector({ value = '', onChange, onClientLink, disabled = false }) {
  const { activeId } = useActiveCompany();

  const { data, isLoading } = useQuery({
    queryKey:  ['invoice-series', activeId],
    queryFn:   getInvoiceSeries,
    staleTime: 60_000,
    enabled:   !!activeId,
  });

  const series = data?.data?.data?.series || [];
  const activeSeries = series.filter((s) => s.isActive);

  if (!activeSeries.length && !isLoading) return null; // hide when no series configured

  const selected = activeSeries.find((s) => s._id === value);

  const handleChange = (e) => {
    const id = e.target.value;
    onChange(id);

    // If the newly-selected series has a linked client, bubble it up so the
    // parent can auto-fill the client dropdown.
    if (onClientLink) {
      const s = activeSeries.find((s) => s._id === id);
      onClientLink(s?.client?._id || s?.client || null);
    }
  };

  return (
    <div>
      <label className="label">
        Invoice Series
        <span className="ml-2 text-xs font-normal text-slate-400">— prefix for invoice number</span>
      </label>
      <div className="relative">
        <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
          <Tag className="w-3.5 h-3.5 text-indigo-400" />
        </div>
        <select
          value={value}
          onChange={handleChange}
          disabled={disabled || isLoading}
          className="input pl-8 font-mono text-sm disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <option value="">— Company default —</option>
          {activeSeries.map((s) => (
            <option key={s._id} value={s._id}>
              {s.prefix}{s.isDefault ? '  ✦ default' : ''}
              {s.client?.name ? `  → ${s.client.name}` : ''}
              {s.description && !s.client?.name ? `  (${s.description})` : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Live preview chip */}
      {selected && (
        <p className="mt-1 text-[11px] text-indigo-500 font-mono font-medium">
          Format: {selected.prefix}-YYYY-YY-000001
          {selected.client?.name && (
            <span className="ml-2 text-[10px] font-sans font-normal text-slate-400 not-italic">
              · client locked to <span className="text-indigo-400 font-medium">{selected.client.name}</span>
            </span>
          )}
        </p>
      )}
    </div>
  );
}
