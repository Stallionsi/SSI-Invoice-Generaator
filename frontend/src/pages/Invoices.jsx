import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, FileText, Search, ChevronLeft, ChevronRight, X, Download, CheckCheck, RotateCcw } from 'lucide-react';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';
import { getInvoices, markInvoiceSent, markInvoiceUnsent } from '../api/invoices.api';
import { useAuthStore } from '../store/authStore';
import PageHeader from '../components/ui/PageHeader';
import StatusBadge from '../components/ui/StatusBadge';
import EmptyState from '../components/ui/EmptyState';
import { fmtCurrency, fmtDate } from '../utils/calculations';

const STATUSES = ['', 'draft', 'sent', 'partial', 'paid', 'overdue', 'cancelled'];

// Skeleton row shown while loading
function SkeletonRow() {
  return (
    <tr>
      {[1, 2, 3, 4, 5, 6, 7].map((i) => (
        <td key={i} className="px-6 py-4">
          <div className="h-4 bg-indigo-50 rounded-lg animate-pulse" style={{ width: i === 5 ? '60%' : '80%' }} />
        </td>
      ))}
    </tr>
  );
}

export default function Invoices() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const activeId = useAuthStore((s) => s.selectedCompanyId);
  // Seed filters from URL params (?status=sent, ?overdue=true)
  const [status, setStatus] = useState(searchParams.get('status') || '');
  const [overdueOnly, setOverdueOnly] = useState(searchParams.get('overdue') === 'true');
  const [inputValue, setInputValue] = useState('');
  const [search, setSearch]         = useState('');
  const [fromDate, setFromDate]     = useState('');
  const [toDate, setToDate]         = useState('');
  const [page, setPage]             = useState(1);

  // Debounce: fire API call 300ms after user stops typing, and reset to page 1
  useEffect(() => {
    const timer = setTimeout(() => { setSearch(inputValue); setPage(1); }, 300);
    return () => clearTimeout(timer);
  }, [inputValue]);

  const hasDates = !!(fromDate || toDate);

  const clearDates = () => {
    setFromDate('');
    setToDate('');
    setPage(1);
  };

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['invoices', activeId, { status, overdueOnly, search, fromDate, toDate, page }],
    queryFn: () => getInvoices({
      ...(overdueOnly ? { overdue: 'true' } : { status: status || undefined }),
      search:   search   || undefined,
      fromDate: fromDate || undefined,
      toDate:   toDate   || undefined,
      page,
      limit: 10,
    }),
    keepPreviousData: true,
  });

  const invoices = data?.data?.data?.invoices || [];
  // paginated() puts pagination at top level, not nested inside data.data
  const pagination = data?.data?.pagination || {};
  const total = pagination.total ?? 0;
  const isFiltered = !!(status || overdueOnly || inputValue || hasDates);

  const [exporting, setExporting] = useState(false);
  const qc = useQueryClient();

  const { mutate: doMarkSent } = useMutation({
    mutationFn: (id) => markInvoiceSent(id),
    onSuccess: () => { toast.success('Marked as sent'); qc.invalidateQueries({ queryKey: ['invoices'] }); },
    onError:   (e) => toast.error(e.response?.data?.message || 'Failed'),
  });
  const { mutate: doMarkUnsent } = useMutation({
    mutationFn: (id) => markInvoiceUnsent(id),
    onSuccess: () => { toast.success('Reverted to draft'); qc.invalidateQueries({ queryKey: ['invoices'] }); },
    onError:   (e) => toast.error(e.response?.data?.message || 'Failed'),
  });

  const handleExport = async () => {
    setExporting(true);
    try {
      const res  = await getInvoices({ limit: 9999 });
      const all  = res?.data?.data?.invoices || [];

      const fmtD = (d) => {
        if (!d) return '';
        const dt = new Date(d);
        if (isNaN(dt)) return '';
        const y = dt.getFullYear();
        const m = String(dt.getMonth() + 1).padStart(2, '0');
        const day = String(dt.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      };
      const n = (v) => (v == null ? 0 : Number(v));

      const rows = all.map((inv) => {
        const grandTotal = n(inv.grandTotal);
        const amountPaid = n(inv.amountPaid);
        return {
          'Invoice No':            inv.invoiceNumber || '',
          'Invoice Date':          fmtD(inv.invoiceDate),
          'Due Date':              fmtD(inv.dueDate),
          'Client':                inv.client?.clientName || inv.recipientDetails?.name || '',
          'PO Number':             inv.purchaseOrderNumber || '',
          'Payment Terms':         inv.paymentTerms || '',
          'Project / Engagement':  [inv.project?.name, inv.project?.description].filter(Boolean).join(' | '),
          'Subtotal':              n(inv.subtotal),
          'Discount':              n(inv.discountTotal ?? inv.discount),
          'Tax':                   n(inv.taxTotal ?? inv.tax),
          'Grand Total':           grandTotal,
          'Amount Paid':           amountPaid,
          'Balance Due':           n(inv.balanceDue ?? (grandTotal - amountPaid)),
          'Currency':              inv.currency || 'INR',
        };
      });

      const ws = XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = [
        { wch: 22 }, // Invoice No
        { wch: 14 }, // Invoice Date
        { wch: 14 }, // Due Date
        { wch: 28 }, // Client
        { wch: 16 }, // PO Number
        { wch: 16 }, // Payment Terms
        { wch: 100 }, // Project / Engagement
        { wch: 12 }, // Subtotal
        { wch: 12 }, // Discount
        { wch: 12 }, // Tax
        { wch: 14 }, // Grand Total
        { wch: 14 }, // Amount Paid
        { wch: 14 }, // Balance Due
        { wch: 10 }, // Currency
      ];
      const range = XLSX.utils.decode_range(ws['!ref']);
      const PROJECT_COL = 6; // "Project / Engagement" column index (0-based)

      // Bold header row
      for (let c = 0; c <= range.e.c; c++) {
        const cell = ws[XLSX.utils.encode_cell({ r: 0, c })];
        if (cell) cell.s = { font: { bold: true } };
      }

      // Wrap text in the Project / Engagement column for all rows
      for (let r = 0; r <= range.e.r; r++) {
        const ref  = XLSX.utils.encode_cell({ r, c: PROJECT_COL });
        const cell = ws[ref];
        if (!cell) continue;
        cell.s = { ...(cell.s || {}), alignment: { wrapText: true, vertical: 'top' } };
      }

      // Set row heights so wrapped content is visible (approx 45pt per data row)
      ws['!rows'] = [{ hpt: 20 }]; // header row
      for (let r = 1; r <= range.e.r; r++) {
        ws['!rows'][r] = { hpt: 45 };
      }

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Invoices');
      XLSX.writeFile(wb, `invoices-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } finally {
      setExporting(false);
    }
  };

  const subtitle = isLoading
    ? 'Loading…'
    : isFiltered
      ? `${invoices.length} result${invoices.length !== 1 ? 's' : ''} of ${total} total`
      : `${total} invoice${total !== 1 ? 's' : ''}`;

  return (
    <div>
      <PageHeader
        title="Invoices"
        subtitle={subtitle}
        actions={
          <div className="flex gap-2">
            <button
              className="btn btn-secondary"
              onClick={handleExport}
              disabled={exporting}
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">{exporting ? 'Exporting…' : 'Export Excel'}</span>
            </button>
            <button className="btn-primary" onClick={() => navigate('/invoices/new')}>
              <Plus className="w-4 h-4" /> New Invoice
            </button>
          </div>
        }
      />

      {/* Filters */}
      <div className="flex flex-col sm:flex-row flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-0 sm:min-w-[180px] sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            className="input pl-9 w-full"
            placeholder="Search by #, client, PO…"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
          />
        </div>
        <select
          className="input sm:w-40"
          value={overdueOnly ? '__overdue__' : status}
          onChange={(e) => {
            const val = e.target.value;
            if (val === '__overdue__') {
              setOverdueOnly(true); setStatus(''); setPage(1);
            } else {
              setOverdueOnly(false); setStatus(val); setPage(1);
            }
          }}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s ? s.charAt(0).toUpperCase() + s.slice(1) : 'All Statuses'}
            </option>
          ))}
          <option value="__overdue__">Overdue (past due)</option>
        </select>
        <div className="flex gap-2 flex-wrap">
          <input
            type="date"
            className="input flex-1 sm:w-40"
            value={fromDate}
            max={toDate || undefined}
            onChange={(e) => { setFromDate(e.target.value); setPage(1); }}
            title="From date"
          />
          <input
            type="date"
            className="input flex-1 sm:w-40"
            value={toDate}
            min={fromDate || undefined}
            onChange={(e) => { setToDate(e.target.value); setPage(1); }}
            title="To date"
          />
          {hasDates && (
            <button
              className="btn btn-secondary btn-sm gap-1 self-center"
              onClick={clearDates}
              title="Clear date range"
            >
              <X className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Clear</span>
            </button>
          )}
        </div>
      </div>

      {/* Table card */}
      <div className="card p-0 overflow-hidden">
        {/* Horizontal scroll wrapper for mobile */}
        <div className="overflow-x-auto">
          {!isLoading && invoices.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No invoices found"
              description={isFiltered ? 'Try adjusting your search or filter.' : 'Create your first invoice to get started.'}
              action={
                !isFiltered && (
                  <button className="btn-primary" onClick={() => navigate('/invoices/new')}>
                    <Plus className="w-4 h-4" /> Create Invoice
                  </button>
                )
              }
            />
          ) : (
            <table className="table-premium w-full text-sm min-w-[600px]">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Client</th>
                  <th>Date</th>
                  <th>Due</th>
                  <th className="text-right">Amount</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {isLoading
                  ? Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)
                  : invoices.map((inv) => {
                      const clientName = inv.client?.clientName || inv.recipientDetails?.name || '—';
                      const initial = clientName.charAt(0).toUpperCase();
                      return (
                        <tr
                          key={inv._id}
                          className={isFetching ? 'opacity-60' : ''}
                          onClick={() => navigate(`/invoices/${inv._id}`)}
                        >
                          <td>
                            <span className="font-bold text-primary-600 hover:text-primary-700 whitespace-nowrap">
                              {inv.invoiceNumber}
                            </span>
                          </td>
                          <td>
                            <div className="flex items-center gap-2.5 max-w-[200px]">
                              <div
                                className="w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                                style={{ background: 'linear-gradient(135deg, #6366F1, #4F46E5)' }}
                              >
                                {initial}
                              </div>
                              <span className="text-gray-800 font-medium truncate">{clientName}</span>
                            </div>
                          </td>
                          <td className="text-gray-500 whitespace-nowrap">{fmtDate(inv.invoiceDate)}</td>
                          <td className="text-gray-500 whitespace-nowrap">{fmtDate(inv.dueDate)}</td>
                          <td className="text-right font-bold text-gray-900 whitespace-nowrap">
                            {fmtCurrency(inv.grandTotal, inv.currency)}
                          </td>
                          <td>
                            <StatusBadge status={inv.status} />
                          </td>
                          <td onClick={(e) => e.stopPropagation()}>
                            {inv.status === 'draft' && (
                              <button
                                title="Mark as Sent"
                                className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-colors whitespace-nowrap"
                                onClick={() => doMarkSent(inv._id)}
                              >
                                <CheckCheck className="w-3.5 h-3.5" /> Mark Sent
                              </button>
                            )}
                            {['sent', 'overdue'].includes(inv.status) && (
                              <button
                                title="Revert to Draft"
                                className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 transition-colors whitespace-nowrap"
                                onClick={() => doMarkUnsent(inv._id)}
                              >
                                <RotateCcw className="w-3.5 h-3.5" /> Mark Unsent
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {!isLoading && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-indigo-50 text-sm">
            <p className="text-gray-400 text-xs">
              Page <span className="font-medium">{pagination.page}</span> of{' '}
              <span className="font-medium">{pagination.totalPages}</span>
              <span className="hidden sm:inline"> &bull; {total} total</span>
            </p>
            <div className="flex gap-2">
              <button
                className="btn btn-secondary btn-sm gap-1"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Prev</span>
              </button>
              <button
                className="btn btn-secondary btn-sm gap-1"
                disabled={page >= pagination.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                <span className="hidden sm:inline">Next</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
