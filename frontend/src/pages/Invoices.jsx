import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus, FileText, Search, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { getInvoices } from '../api/invoices.api';
import PageHeader from '../components/ui/PageHeader';
import StatusBadge from '../components/ui/StatusBadge';
import EmptyState from '../components/ui/EmptyState';
import { fmtCurrency, fmtDate } from '../utils/calculations';

const STATUSES = ['', 'draft', 'sent', 'partial', 'paid', 'overdue', 'cancelled'];

// Skeleton row shown while loading
function SkeletonRow() {
  return (
    <tr>
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <td key={i} className="px-6 py-4">
          <div className="h-4 bg-slate-100 rounded animate-pulse" style={{ width: i === 5 ? '60%' : '80%' }} />
        </td>
      ))}
    </tr>
  );
}

export default function Invoices() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Seed the status filter from ?status=overdue (or any status) in the URL
  const [status, setStatus] = useState(searchParams.get('status') || '');
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
    queryKey: ['invoices', { status, search, fromDate, toDate, page }],
    queryFn: () => getInvoices({
      status:   status   || undefined,
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
  const isFiltered = !!(status || inputValue || hasDates);

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
          <button className="btn-primary" onClick={() => navigate('/invoices/new')}>
            <Plus className="w-4 h-4" /> New Invoice
          </button>
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
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s ? s.charAt(0).toUpperCase() + s.slice(1) : 'All Statuses'}
            </option>
          ))}
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
            <table className="w-full text-sm min-w-[600px]">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">#</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">Client</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">Date</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">Due</th>
                  <th className="text-right px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">Amount</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading
                  ? Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)
                  : invoices.map((inv) => (
                      <tr
                        key={inv._id}
                        className={`hover:bg-slate-50 cursor-pointer transition-all duration-150 ${isFetching ? 'opacity-60' : ''}`}
                        onClick={() => navigate(`/invoices/${inv._id}`)}
                      >
                        <td className="px-6 py-4 font-semibold text-primary-600 whitespace-nowrap">{inv.invoiceNumber}</td>
                        <td className="px-6 py-4 text-slate-800 max-w-[200px] truncate">
                          {inv.client?.clientName || inv.recipientDetails?.name || '—'}
                        </td>
                        <td className="px-6 py-4 text-slate-500 whitespace-nowrap">{fmtDate(inv.invoiceDate)}</td>
                        <td className="px-6 py-4 text-slate-500 whitespace-nowrap">{fmtDate(inv.dueDate)}</td>
                        <td className="px-6 py-4 text-right font-semibold text-slate-900 whitespace-nowrap">
                          {fmtCurrency(inv.grandTotal, inv.currency)}
                        </td>
                        <td className="px-6 py-4">
                          <StatusBadge status={inv.status} />
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {!isLoading && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-slate-200 text-sm">
            <p className="text-slate-500 text-xs">
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
