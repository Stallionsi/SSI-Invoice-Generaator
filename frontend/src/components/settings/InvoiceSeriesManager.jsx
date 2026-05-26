import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Plus, Star, Trash2, Pencil, Check, X, Tag, Hash, User } from 'lucide-react';
import {
  getInvoiceSeries,
  createInvoiceSeries,
  updateInvoiceSeries,
  setDefaultInvoiceSeries,
  deleteInvoiceSeries,
} from '../../api/invoiceSeries.api';
import { getClients } from '../../api/clients.api';
import { useActiveCompany } from '../../hooks/useActiveCompany';
import Spinner from '../ui/Spinner';

// ─── Client picker ─────────────────────────────────────────────────────────────
function ClientPicker({ value, onChange, activeId }) {
  const { data } = useQuery({
    queryKey: ['clients', activeId, { limit: 200 }],
    queryFn:  () => getClients({ limit: 200 }),
    staleTime: 60_000,
    enabled:  !!activeId,
  });
  const clients = data?.data?.data?.clients || [];

  return (
    <div className="relative">
      <div className="absolute inset-y-0 left-2.5 flex items-center pointer-events-none">
        <User className="w-3.5 h-3.5 text-gray-400" />
      </div>
      <select
        value={value || ''}
        onChange={(e) => onChange(e.target.value || null)}
        className="input pl-8 text-sm"
      >
        <option value="">— No client lock —</option>
        {clients.map((c) => (
          <option key={c._id} value={c._id}>{c.clientName}</option>
        ))}
      </select>
    </div>
  );
}

// ─── Inline Edit Row ──────────────────────────────────────────────────────────
function EditRow({ series, onSave, onCancel, activeId }) {
  const [prefix, setPrefix]           = useState(series.prefix);
  const [description, setDescription] = useState(series.description || '');
  const [clientId, setClientId]       = useState(series.client?._id || series.client || '');

  return (
    <div className="flex flex-wrap items-center gap-2 py-2">
      <input
        value={prefix}
        onChange={(e) => setPrefix(e.target.value.toUpperCase())}
        className="input font-mono w-28 text-sm uppercase"
        placeholder="SSI/PAL"
        maxLength={30}
      />
      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className="input flex-1 text-sm min-w-[120px]"
        placeholder="Description (optional)"
        maxLength={200}
      />
      <div className="min-w-[160px]">
        <ClientPicker value={clientId} onChange={setClientId} activeId={activeId} />
      </div>
      <button
        onClick={() => onSave({ prefix, description, client: clientId || null })}
        className="p-1.5 rounded-lg text-green-600 hover:bg-green-50 transition-colors"
        title="Save"
      >
        <Check className="w-4 h-4" />
      </button>
      <button
        onClick={onCancel}
        className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-50 transition-colors"
        title="Cancel"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

// ─── Create Form ──────────────────────────────────────────────────────────────
function CreateForm({ onSubmit, onCancel, isPending, activeId }) {
  const [prefix, setPrefix]       = useState('');
  const [description, setDesc]    = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [clientId, setClientId]   = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!prefix.trim()) { toast.error('Prefix is required'); return; }
    onSubmit({
      prefix:      prefix.trim().toUpperCase(),
      description: description.trim(),
      isDefault,
      client:      clientId || null,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="mt-3 p-4 rounded-xl border border-indigo-100 bg-indigo-50/40 space-y-3">
      <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wide">New Series</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-500 font-medium block mb-1">Prefix *</label>
          <input
            value={prefix}
            onChange={(e) => setPrefix(e.target.value.toUpperCase())}
            className="input font-mono text-sm uppercase"
            placeholder="INV"
            maxLength={30}
            required
          />
          {prefix && (
            <p className="mt-0.5 text-[10px] text-indigo-500 font-mono">
              → {prefix}-2026-27-000001
            </p>
          )}
        </div>
        <div>
          <label className="text-xs text-gray-500 font-medium block mb-1">Description</label>
          <input
            value={description}
            onChange={(e) => setDesc(e.target.value)}
            className="input text-sm"
            placeholder="e.g. Kayla IT invoices"
            maxLength={200}
          />
        </div>
      </div>

      {/* Client lock */}
      <div>
        <label className="text-xs text-gray-500 font-medium block mb-1 flex items-center gap-1">
          <User className="w-3 h-3" />
          Lock to Client
          <span className="font-normal text-gray-400 ml-1">— selecting this series auto-fills the client</span>
        </label>
        <ClientPicker value={clientId} onChange={setClientId} activeId={activeId} />
      </div>

      <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700 select-none">
        <input
          type="checkbox"
          checked={isDefault}
          onChange={(e) => setIsDefault(e.target.checked)}
          className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
        />
        Set as default series
      </label>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors disabled:opacity-60"
        >
          {isPending ? <Spinner /> : <Plus className="w-3.5 h-3.5" />}
          Create
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-1.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function InvoiceSeriesManager() {
  const qc = useQueryClient();
  const { activeId } = useActiveCompany();

  const [creating, setCreating]   = useState(false);
  const [editingId, setEditingId] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['invoice-series', activeId],
    queryFn:  getInvoiceSeries,
    staleTime: 30_000,
    enabled:  !!activeId,
  });
  const series = data?.data?.data?.series || [];

  const invalidate = () => qc.invalidateQueries({ queryKey: ['invoice-series', activeId] });

  const createMut = useMutation({
    mutationFn: createInvoiceSeries,
    onSuccess: () => { toast.success('Series created'); setCreating(false); invalidate(); },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to create series'),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => updateInvoiceSeries(id, data),
    onSuccess: () => { toast.success('Series updated'); setEditingId(null); invalidate(); },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to update series'),
  });

  const defaultMut = useMutation({
    mutationFn: setDefaultInvoiceSeries,
    onSuccess: () => { toast.success('Default series updated'); invalidate(); },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to update default'),
  });

  const deleteMut = useMutation({
    mutationFn: deleteInvoiceSeries,
    onSuccess: () => { toast.success('Series deleted'); invalidate(); },
    onError: (e) => toast.error(e.response?.data?.message || 'Cannot delete — series has invoices'),
  });

  const handleDelete = (s) => {
    if (s.totalInvoices > 0) {
      toast.error(`Cannot delete "${s.prefix}" — it has ${s.totalInvoices} invoice(s). Deactivate it instead.`);
      return;
    }
    if (!window.confirm(`Delete series "${s.prefix}"? This cannot be undone.`)) return;
    deleteMut.mutate(s._id);
  };

  const handleToggleActive = (s) => {
    updateMut.mutate({ id: s._id, data: { isActive: !s.isActive } });
  };

  return (
    <div className="card">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Tag className="w-4 h-4 text-indigo-500" />
          <h2 className="text-base font-semibold text-gray-800">Invoice Series</h2>
        </div>
        {!creating && (
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-indigo-600 border border-indigo-200 hover:bg-indigo-50 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            New Series
          </button>
        )}
      </div>

      {/* Explainer */}
      <p className="text-xs text-gray-500 mb-4 leading-relaxed">
        Invoice series let you use multiple prefixes — e.g. <span className="font-mono text-indigo-600">SSI/PAL</span>,{' '}
        <span className="font-mono text-indigo-600">SSI/COM</span> — each with its own independent counter per client.
        Lock a series to a client so selecting it auto-fills the client on new invoices.
      </p>

      {/* List */}
      {isLoading ? (
        <div className="flex justify-center py-6"><Spinner /></div>
      ) : series.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <Hash className="w-8 h-8 text-gray-300" />
          <p className="text-sm text-gray-400">No series yet. Create one to get started.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Column headers */}
          <div className="grid grid-cols-12 gap-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
            <span className="col-span-3">Prefix</span>
            <span className="col-span-3 hidden sm:block">Client / Description</span>
            <span className="col-span-2 text-right">Invoices</span>
            <span className="col-span-2 text-right hidden sm:block">Last #</span>
            <span className="col-span-2 text-right">Actions</span>
          </div>

          {series.map((s) => (
            <div
              key={s._id}
              className={`rounded-xl border transition-all ${
                s.isActive
                  ? 'border-gray-100 bg-white hover:border-indigo-100 hover:shadow-sm'
                  : 'border-gray-100 bg-gray-50 opacity-60'
              }`}
            >
              {editingId === s._id ? (
                <div className="px-3">
                  <EditRow
                    series={s}
                    onSave={(d) => updateMut.mutate({ id: s._id, data: d })}
                    onCancel={() => setEditingId(null)}
                    activeId={activeId}
                  />
                </div>
              ) : (
                <div className="grid grid-cols-12 gap-2 px-3 py-3 items-center">
                  {/* Prefix */}
                  <div className="col-span-3 flex items-center gap-2 min-w-0">
                    <span className="font-mono text-sm font-bold text-indigo-700 truncate">
                      {s.prefix}
                    </span>
                    {s.isDefault && (
                      <Star className="w-3 h-3 text-amber-400 fill-amber-400 shrink-0" title="Default series" />
                    )}
                    {!s.isActive && (
                      <span className="text-[9px] font-semibold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                        OFF
                      </span>
                    )}
                  </div>

                  {/* Client / Description */}
                  <div className="col-span-3 hidden sm:block min-w-0">
                    {s.client?.name ? (
                      <span className="flex items-center gap-1 text-xs text-indigo-600 font-medium truncate">
                        <User className="w-3 h-3 shrink-0" />
                        {s.client.name}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400 truncate block">
                        {s.description || '—'}
                      </span>
                    )}
                  </div>

                  {/* Total invoices */}
                  <div className="col-span-2 text-right">
                    <span className="text-sm font-semibold text-gray-700">
                      {s.totalInvoices ?? 0}
                    </span>
                  </div>

                  {/* Last sequence */}
                  <div className="col-span-2 text-right hidden sm:block">
                    <span className="font-mono text-xs text-gray-500">
                      {s.lastSequence
                        ? String(s.lastSequence).padStart(6, '0')
                        : '—'}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="col-span-2 flex items-center justify-end gap-1">
                    {/* Set default */}
                    {!s.isDefault && s.isActive && (
                      <button
                        onClick={() => defaultMut.mutate(s._id)}
                        className="p-1.5 text-gray-300 hover:text-amber-500 transition-colors rounded-lg hover:bg-amber-50"
                        title="Set as default"
                      >
                        <Star className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {/* Edit */}
                    <button
                      onClick={() => setEditingId(s._id)}
                      className="p-1.5 text-gray-300 hover:text-indigo-500 transition-colors rounded-lg hover:bg-indigo-50"
                      title="Edit series"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>

                    {/* Toggle active */}
                    <button
                      onClick={() => handleToggleActive(s)}
                      className={`p-1.5 transition-colors rounded-lg text-xs font-semibold ${
                        s.isActive
                          ? 'text-gray-300 hover:text-orange-500 hover:bg-orange-50'
                          : 'text-gray-300 hover:text-green-600 hover:bg-green-50'
                      }`}
                      title={s.isActive ? 'Deactivate' : 'Activate'}
                    >
                      {s.isActive ? <X className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
                    </button>

                    {/* Delete */}
                    <button
                      onClick={() => handleDelete(s)}
                      className="p-1.5 text-gray-300 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50"
                      title={s.totalInvoices > 0 ? 'Has invoices — deactivate instead' : 'Delete series'}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create form */}
      {creating && (
        <CreateForm
          onSubmit={(d) => createMut.mutate(d)}
          onCancel={() => setCreating(false)}
          isPending={createMut.isPending}
          activeId={activeId}
        />
      )}
    </div>
  );
}
