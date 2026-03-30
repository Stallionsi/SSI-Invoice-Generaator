import { useState, useMemo, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { Download, TrendingUp, Clock, Users, DollarSign, FileText, ChevronDown } from 'lucide-react';
import * as XLSX from 'xlsx';
import { getInvoices } from '../api/invoices.api';
import { getClientReport } from '../api/reports.api';
import { getClients } from '../api/clients.api';
import PageHeader from '../components/ui/PageHeader';
import Spinner from '../components/ui/Spinner';
import { fmtCurrency, fmtDate } from '../utils/calculations';
import StatusBadge from '../components/ui/StatusBadge';
import toast from 'react-hot-toast';

// ── Constants ───────────────────────────────────────────────────────────────
const AGING_COLORS = ['#3b82f6', '#f59e0b', '#ef4444', '#dc2626', '#7f1d1d'];
const MONTH_NAMES  = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ── Pure helpers ────────────────────────────────────────────────────────────

/** Return a finite number or 0 — never NaN/undefined */
const n = (v) => (isFinite(+v) ? +v : 0);

/** Parse a date string/object; return null if invalid */
const parseDate = (d) => {
  if (!d) return null;
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? null : dt;
};

/** Normalise status to lowercase for comparisons */
const status = (inv) => (inv?.status ?? '').toLowerCase();

// ── Aggregation helpers (all operate on the fetched invoices array) ─────────

/**
 * Compute stats for a set of invoices that all share one currency.
 * Returns { totalRevenue, totalCollected, outstanding }.
 */
function computeStats(invoices) {
  let totalRevenue   = 0;
  let totalCollected = 0;
  let outstanding    = 0;

  for (const inv of invoices) {
    const amt = n(inv.grandTotal);
    const s   = status(inv);
    if (s === 'cancelled') continue;
    totalRevenue += amt;
    if (s === 'paid') totalCollected += amt;
    else              outstanding    += amt;
  }
  return { totalRevenue, totalCollected, outstanding };
}

/**
 * When viewing all clients (mixed currencies), compute stats grouped by currency.
 * Returns an array of { currency, totalRevenue, totalCollected, outstanding }.
 * Currencies with all-zero totals are omitted.
 */
function computeStatsByCurrency(invoices) {
  const map = {};
  for (const inv of invoices) {
    const cur = inv.currency || 'INR';
    const amt = n(inv.grandTotal);
    const s   = status(inv);
    if (s === 'cancelled') continue;
    if (!map[cur]) map[cur] = { currency: cur, totalRevenue: 0, totalCollected: 0, outstanding: 0 };
    map[cur].totalRevenue += amt;
    if (s === 'paid') map[cur].totalCollected += amt;
    else              map[cur].outstanding    += amt;
  }
  return Object.values(map).sort((a, b) => a.currency.localeCompare(b.currency));
}

function buildChartData(invoices, period, currency) {
  // Only PAID invoices of the chosen currency contribute to the revenue chart
  const paid = invoices.filter(
    (inv) => status(inv) === 'paid' && (inv.currency || 'INR') === currency,
  );

  const map = {};

  paid.forEach((inv) => {
    const date = parseDate(inv.invoiceDate || inv.createdAt);
    if (!date) return;

    let key, sortKey;
    if (period === 'monthly') {
      const m    = date.getMonth();          // 0-based
      const yr   = date.getFullYear();
      key        = `${MONTH_NAMES[m]} '${String(yr).slice(2)}`;
      sortKey    = `${yr}${String(m + 1).padStart(2, '0')}`;
    } else if (period === 'quarterly') {
      const q    = Math.ceil((date.getMonth() + 1) / 3);
      const yr   = date.getFullYear();
      key        = `Q${q} ${yr}`;
      sortKey    = `${yr}${q}`;
    } else {
      // yearly
      key = sortKey = String(date.getFullYear());
    }

    if (!map[sortKey]) map[sortKey] = { label: key, revenue: 0, sortKey };
    map[sortKey].revenue += n(inv.grandTotal);
  });

  return Object.values(map).sort((a, b) => a.sortKey.localeCompare(b.sortKey));
}

function buildAgingBuckets(invoices) {
  const now = new Date();

  // Only unpaid, non-cancelled invoices go into aging
  const unpaid = invoices.filter((inv) => {
    const s = status(inv);
    return s !== 'paid' && s !== 'cancelled' && s !== 'draft';
  });

  const buckets = { current: 0, b0_30: 0, b31_60: 0, b61_90: 0, b90plus: 0 };

  unpaid.forEach((inv) => {
    const amt = n(inv.grandTotal);
    const due = parseDate(inv.dueDate);

    if (!due) { buckets.current += amt; return; }

    const days = Math.floor((now - due) / 86_400_000); // ms per day
    if (days < 0)        buckets.current += amt;
    else if (days <= 30) buckets.b0_30   += amt;
    else if (days <= 60) buckets.b31_60  += amt;
    else if (days <= 90) buckets.b61_90  += amt;
    else                 buckets.b90plus += amt;
  });

  return [
    { name: 'Current',    value: buckets.current },
    { name: '0–30 days',  value: buckets.b0_30   },
    { name: '31–60 days', value: buckets.b31_60  },
    { name: '61–90 days', value: buckets.b61_90  },
    { name: '90+ days',   value: buckets.b90plus  },
  ].filter((b) => b.value > 0);
}

// ── XLSX export (SheetJS — proper column widths, no "########") ─────────────

/** Format a date as YYYY-MM-DD string; empty string if invalid */
function fmtDateStr(d) {
  const dt = parseDate(d);
  if (!dt) return '';
  const y   = dt.getFullYear();
  const m   = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function downloadInvoicesXlsx(invoices) {
  // Build plain JS objects — SheetJS maps keys → header row automatically
  const data = invoices.map((inv) => {
    const grandTotal = n(inv.grandTotal);
    const amountPaid = n(inv.amountPaid);
    const balanceDue = n(inv.balanceDue ?? (grandTotal - amountPaid));

    return {
      'Invoice No':   inv.invoiceNumber  || '',
      'Invoice Date': fmtDateStr(inv.invoiceDate),
      'Due Date':     fmtDateStr(inv.dueDate),
      'Client Name':  inv.client?.clientName || inv.recipientName || '',
      'Status':       (inv.status || '').charAt(0).toUpperCase() + (inv.status || '').slice(1),
      'Subtotal':     n(inv.subtotal),
      'Discount':     n(inv.discountTotal ?? inv.discount),
      'Tax':          n(inv.taxTotal    ?? inv.tax),
      'Grand Total':  grandTotal,
      'Amount Paid':  amountPaid,
      'Balance Due':  balanceDue,
      'Currency':     inv.currency || 'INR',
    };
  });

  const ws = XLSX.utils.json_to_sheet(data);

  // Set explicit column widths (wch = width in characters)
  ws['!cols'] = [
    { wch: 18 }, // Invoice No
    { wch: 14 }, // Invoice Date
    { wch: 14 }, // Due Date
    { wch: 28 }, // Client Name
    { wch: 12 }, // Status
    { wch: 12 }, // Subtotal
    { wch: 12 }, // Discount
    { wch: 12 }, // Tax
    { wch: 14 }, // Grand Total
    { wch: 14 }, // Amount Paid
    { wch: 14 }, // Balance Due
    { wch: 10 }, // Currency
  ];

  // Style the header row: bold
  const range  = XLSX.utils.decode_range(ws['!ref']);
  const colCount = range.e.c + 1;
  for (let c = 0; c < colCount; c++) {
    const cellRef = XLSX.utils.encode_cell({ r: 0, c });
    if (!ws[cellRef]) continue;
    ws[cellRef].s = { font: { bold: true } };
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Invoices');

  // Triggers a browser download of the .xlsx file
  XLSX.writeFile(wb, `invoices-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// ── Sub-components ──────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, color = 'blue' }) {
  const palette = {
    blue:  'bg-primary-50  text-primary-600',
    green: 'bg-emerald-50  text-emerald-600',
    amber: 'bg-amber-50    text-amber-600',
    red:   'bg-rose-50     text-rose-600',
  };
  return (
    <div className="card flex items-center gap-4 p-5">
      <div className={`p-3 rounded-xl shrink-0 ${palette[color]}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
        <p className="text-xl font-bold text-gray-900 mt-0.5 truncate">{value}</p>
      </div>
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="space-y-3 py-4">
      <div className="h-4 w-1/3 bg-gray-100 rounded animate-pulse" />
      <div className="h-52 bg-gray-50 rounded-lg animate-pulse" />
    </div>
  );
}

function RevenueTooltip({ active, payload, label, currency = 'INR' }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-sm">
      <p className="font-semibold text-gray-700 mb-1">{label}</p>
      <p className="text-blue-600 font-bold">{fmtCurrency(payload[0]?.value, currency)}</p>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────
export default function Reports() {
  const location = useLocation();
  const navigate = useNavigate();
  const [period, setPeriod] = useState('monthly');
  const [selectedClient, setSelectedClient] = useState('all');
  const [chartCurrency, setChartCurrency] = useState('INR');

  // Seed client filter from navigation state (e.g. clicking a client on the Clients page)
  useEffect(() => {
    if (location.state?.clientId) {
      setSelectedClient(location.state.clientId);
    }
  }, [location.state?.clientId]);

  // Fetch all invoices for client-side computation (backend MAX_LIMIT = 100)
  const { data: invRes, isLoading: invLoading } = useQuery({
    queryKey: ['reports-invoices'],
    queryFn:  () => getInvoices({ limit: 100, sort: '-invoiceDate' }),
    staleTime: 60_000,
  });

  // Fetch all clients for the dropdown (limit: 100)
  const { data: clientsListRes } = useQuery({
    queryKey: ['reports-clients-list'],
    queryFn:  () => getClients({ limit: 100, sort: 'clientName' }),
    staleTime: 60_000,
  });

  // Top clients table — backend aggregate (all invoices)
  const { data: clientsRes, isLoading: clientsLoading } = useQuery({
    queryKey: ['client-report'],
    queryFn:  getClientReport,
    staleTime: 60_000,
  });

  // ── Raw data ──────────────────────────────────────────────────────────────
  const invoices       = invRes?.data?.data?.invoices         || [];
  const clientDropdown = clientsListRes?.data?.data?.clients  || [];
  const clientList     = clientsRes?.data?.data?.clients      || [];

  // ── Client filter ─────────────────────────────────────────────────────────
  // invoice.client is a populated object with ._id; match by string comparison
  const filteredInvoices = useMemo(() => {
    if (selectedClient === 'all') return invoices;
    return invoices.filter((inv) => {
      const id = inv.client?._id ?? inv.client;
      return String(id) === selectedClient;
    });
  }, [invoices, selectedClient]);

  // ── Currency detection ────────────────────────────────────────────────────
  // Derive the set of currencies present in the filtered invoices.
  const currenciesInView = useMemo(() => {
    const set = new Set(filteredInvoices.map((inv) => inv.currency || 'INR'));
    return [...set].sort();
  }, [filteredInvoices]);

  // True when multiple currencies are mixed in the current view (only possible in "All Clients" mode).
  const isMixedCurrency = currenciesInView.length > 1;

  // The single active currency — used when one client is selected or all invoices share one currency.
  const activeCurrency = isMixedCurrency ? null : (currenciesInView[0] || 'INR');

  // Keep chartCurrency in sync: when the view has a single currency, adopt it automatically.
  useEffect(() => {
    if (activeCurrency) setChartCurrency(activeCurrency);
  }, [activeCurrency]);

  // ── Stats ─────────────────────────────────────────────────────────────────
  // Single-currency stats (used when a client is selected or all invoices share one currency).
  const { totalRevenue, totalCollected, outstanding } = useMemo(
    () => computeStats(filteredInvoices),
    [filteredInvoices],
  );

  // Per-currency stats (used in "All Clients" mixed-currency view).
  const statsByCurrency = useMemo(
    () => computeStatsByCurrency(filteredInvoices),
    [filteredInvoices],
  );

  // For "Total Invoices": use pagination.total when showing all, filtered count otherwise
  const totalCount = selectedClient === 'all'
    ? (invRes?.data?.pagination?.total ?? invoices.length)
    : filteredInvoices.length;

  // Chart — paid invoices of the active chartCurrency grouped by selected period
  const chartData = useMemo(
    () => buildChartData(filteredInvoices, period, chartCurrency),
    [filteredInvoices, period, chartCurrency],
  );

  // Aging pie — unpaid invoices bucketed by days past due
  // When mixed currency, only bucket invoices of chartCurrency to keep amounts meaningful.
  const agingPie = useMemo(
    () => buildAgingBuckets(
      isMixedCurrency
        ? filteredInvoices.filter((inv) => (inv.currency || 'INR') === chartCurrency)
        : filteredInvoices,
    ),
    [filteredInvoices, isMixedCurrency, chartCurrency],
  );

  // ── Excel export — honours active filter ─────────────────────────────────
  const handleExport = () => {
    if (!filteredInvoices.length) { toast.error('No invoices to export'); return; }
    try {
      downloadInvoicesXlsx(filteredInvoices);
      toast.success('Excel file downloaded');
    } catch {
      toast.error('Export failed');
    }
  };

  const isLoading = invLoading;
  const isFiltered = selectedClient !== 'all';
  const selectedClientName = isFiltered
    ? (clientDropdown.find((c) => c._id === selectedClient)?.clientName ?? 'Client')
    : null;

  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle={isFiltered ? `Showing data for ${selectedClientName}` : 'Financial analytics overview'}
        actions={
          <div className="flex items-center gap-2">
            {/* ── Client filter dropdown ── */}
            <div className="relative">
              <select
                value={selectedClient}
                onChange={(e) => setSelectedClient(e.target.value)}
                className="input pr-8 appearance-none text-sm cursor-pointer min-w-[160px]"
              >
                <option value="all">All Clients</option>
                {clientDropdown.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.clientName}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            </div>
            <button className="btn btn-secondary" onClick={handleExport} disabled={isLoading}>
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Export Excel</span>
            </button>
          </div>
        }
      />

      {/* ── KPI stat cards ──────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="card flex items-center gap-4 p-5">
              <div className="p-3 rounded-xl bg-gray-100 shrink-0 w-11 h-11 animate-pulse" />
              <div className="space-y-2 flex-1">
                <div className="h-3 bg-gray-100 rounded animate-pulse w-2/3" />
                <div className="h-5 bg-gray-100 rounded animate-pulse w-full" />
              </div>
            </div>
          ))}
        </div>
      ) : isFiltered ? (
        /* ── Client selected: combined totals + per-currency breakdown ── */
        <div className="mb-6 space-y-4">
          {/* Combined across all currencies */}
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              Combined — All Currencies
            </p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                icon={TrendingUp}
                label="Total Revenue"
                value={
                  activeCurrency
                    ? fmtCurrency(totalRevenue, activeCurrency)
                    : n(totalRevenue).toLocaleString('en-IN', { maximumFractionDigits: 2 })
                }
                color="blue"
              />
              <StatCard
                icon={DollarSign}
                label="Total Collected"
                value={
                  activeCurrency
                    ? fmtCurrency(totalCollected, activeCurrency)
                    : n(totalCollected).toLocaleString('en-IN', { maximumFractionDigits: 2 })
                }
                color="green"
              />
              <StatCard
                icon={Clock}
                label="Outstanding"
                value={
                  activeCurrency
                    ? fmtCurrency(outstanding, activeCurrency)
                    : n(outstanding).toLocaleString('en-IN', { maximumFractionDigits: 2 })
                }
                color="amber"
              />
              <StatCard
                icon={FileText}
                label="Total Invoices"
                value={totalCount}
                color="blue"
              />
            </div>
          </div>

          {/* Per-currency breakdown — each currency as its own column card */}
          {statsByCurrency.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Currency Breakdown
              </p>
              <div
                className={`grid gap-4 ${
                  statsByCurrency.length === 1
                    ? 'grid-cols-1 max-w-xs'
                    : statsByCurrency.length === 2
                    ? 'grid-cols-2'
                    : 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3'
                }`}
              >
                {statsByCurrency.map((s) => {
                  const invCount = filteredInvoices.filter(
                    (inv) => (inv.currency || 'INR') === s.currency,
                  ).length;
                  return (
                    <div key={s.currency} className="card p-4">
                      {/* Currency header */}
                      <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
                        <span className="text-sm font-bold text-slate-800 uppercase tracking-wide">
                          {s.currency}
                        </span>
                        <span className="text-xs bg-slate-100 text-slate-500 rounded-full px-2 py-0.5">
                          {invCount} invoice{invCount !== 1 ? 's' : ''}
                        </span>
                      </div>

                      {/* Stat rows */}
                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-slate-500 flex items-center gap-1.5">
                            <TrendingUp className="w-3.5 h-3.5 text-blue-400" />
                            Revenue
                          </span>
                          <span className="text-sm font-bold text-slate-900">
                            {fmtCurrency(s.totalRevenue, s.currency)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-slate-500 flex items-center gap-1.5">
                            <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                            Collected
                          </span>
                          <span className="text-sm font-bold text-emerald-700">
                            {fmtCurrency(s.totalCollected, s.currency)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-slate-500 flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-amber-400" />
                            Outstanding
                          </span>
                          <span className={`text-sm font-bold ${s.outstanding > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                            {fmtCurrency(s.outstanding, s.currency)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ) : isMixedCurrency ? (
        /* ── Multi-currency breakdown (All Clients with mixed currencies) ── */
        <div className="mb-6 space-y-3">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Totals by Currency — select a client for a single-currency view
          </p>
          {statsByCurrency.map((s) => (
            <div key={s.currency} className="card p-4">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                {s.currency}
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard icon={TrendingUp} label="Total Revenue"   value={fmtCurrency(s.totalRevenue,   s.currency)} color="blue"  />
                <StatCard icon={DollarSign} label="Total Collected"  value={fmtCurrency(s.totalCollected, s.currency)} color="green" />
                <StatCard icon={Clock}      label="Outstanding"      value={fmtCurrency(s.outstanding,    s.currency)} color="amber" />
                <StatCard icon={FileText}   label="Total Invoices"
                  value={filteredInvoices.filter((inv) => (inv.currency || 'INR') === s.currency).length}
                  color="blue"
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* ── Single-currency KPI cards (All Clients, one currency) ── */
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatCard
            icon={TrendingUp}
            label="Total Revenue"
            value={fmtCurrency(totalRevenue, activeCurrency)}
            color="blue"
          />
          <StatCard
            icon={DollarSign}
            label="Total Collected"
            value={fmtCurrency(totalCollected, activeCurrency)}
            color="green"
          />
          <StatCard
            icon={Clock}
            label="Outstanding"
            value={fmtCurrency(outstanding, activeCurrency)}
            color="amber"
          />
          <StatCard
            icon={FileText}
            label="Total Invoices"
            value={totalCount}
            color="blue"
          />
        </div>
      )}

      {/* ── Empty state when filtered client has no invoices ─────────────── */}
      {isFiltered && !isLoading && filteredInvoices.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-20 text-center">
          <FileText className="w-12 h-12 text-slate-200 mb-4" />
          <p className="text-base font-semibold text-slate-600">
            No data for {selectedClientName}
          </p>
          <p className="text-sm text-slate-400 mt-1">
            This client has no invoices in the system.
          </p>
          <button
            className="btn btn-secondary btn-sm mt-4"
            onClick={() => setSelectedClient('all')}
          >
            View All Clients
          </button>
        </div>
      ) : (
        <>
      {/* ── Period selector + currency picker ───────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        {['monthly', 'quarterly', 'yearly'].map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`btn btn-sm capitalize ${period === p ? 'btn-primary' : 'btn-secondary'}`}
          >
            {p}
          </button>
        ))}
        {isMixedCurrency && (
          <select
            value={chartCurrency}
            onChange={(e) => setChartCurrency(e.target.value)}
            className="input text-sm ml-auto w-auto"
            title="Chart currency"
          >
            {currenciesInView.map((cur) => (
              <option key={cur} value={cur}>{cur}</option>
            ))}
          </select>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

        {/* ── Revenue bar chart ───────────────────────────────────────────── */}
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-700 mb-4 capitalize">
            Revenue — {period}{' '}
            <span className="text-gray-400 font-normal">(paid invoices · {chartCurrency})</span>
          </h2>
          {isLoading ? (
            <ChartSkeleton />
          ) : chartData.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <TrendingUp className="w-10 h-10 text-gray-200 mb-3" />
              <p className="text-sm text-gray-400">No paid invoices found</p>
              <p className="text-xs text-gray-300 mt-1">
                Mark invoices as <strong>Paid</strong> to see revenue here
              </p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: '#9ca3af' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#9ca3af' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) =>
                    v >= 100_000 ? `${(v / 100_000).toFixed(1)}L`
                    : v >= 1_000  ? `${(v / 1_000).toFixed(0)}k`
                    : v
                  }
                />
                <Tooltip content={<RevenueTooltip currency={chartCurrency} />} cursor={{ fill: '#eff6ff' }} />
                <Bar dataKey="revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* ── Receivables aging pie ───────────────────────────────────────── */}
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">
            Receivables Aging
            <span className="text-gray-400 font-normal text-xs ml-1">· {chartCurrency}</span>
          </h2>
          {isLoading ? (
            <ChartSkeleton />
          ) : agingPie.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <Clock className="w-10 h-10 text-gray-200 mb-3" />
              <p className="text-sm text-gray-400">No outstanding receivables</p>
              <p className="text-xs text-gray-300 mt-1">All invoices are settled</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={agingPie}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="45%"
                  outerRadius={90}
                  label={({ percent }) => percent > 0.05 ? `${(percent * 100).toFixed(0)}%` : ''}
                  labelLine={false}
                >
                  {agingPie.map((_, i) => (
                    <Cell key={i} fill={AGING_COLORS[i % AGING_COLORS.length]} />
                  ))}
                </Pie>
                <Legend
                  formatter={(value, entry) => (
                    <span className="text-xs text-gray-600">
                      {value} — {fmtCurrency(entry.payload.value, chartCurrency)}
                    </span>
                  )}
                />
                <Tooltip formatter={(v) => [fmtCurrency(v, chartCurrency), 'Receivable']} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* ── Top clients table ───────────────────────────────────────────── */}
        <div className="card xl:col-span-2">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Top Clients by Revenue</h2>
          {clientsLoading ? (
            <div className="flex justify-center py-10"><Spinner /></div>
          ) : clientList.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Users className="w-10 h-10 text-gray-200 mb-3" />
              <p className="text-sm text-gray-400">No client data yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[500px]">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Client</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Invoices</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Revenue</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Outstanding</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Collected</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {clientList.slice(0, 10).map((c) => {
                    // Look up this client's currency from the dropdown list (which has the full client object)
                    const clientCur = clientDropdown.find((d) => d._id === c._id)?.currency || 'INR';
                    return (
                      <tr key={c._id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-800">{c.clientName}</p>
                          {c.companyName && c.companyName !== c.clientName && (
                            <p className="text-xs text-gray-400">{c.companyName}</p>
                          )}
                          {clientCur !== 'INR' && (
                            <span className="text-xs font-semibold text-slate-400">{clientCur}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-500">{c.invoiceCount}</td>
                        <td className="px-4 py-3 text-right font-semibold text-gray-900">{fmtCurrency(c.totalRevenue, clientCur)}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={n(c.totalDue) > 0 ? 'text-rose-600 font-medium' : 'text-slate-400'}>
                            {fmtCurrency(c.totalDue, clientCur)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-emerald-600 font-medium">{fmtCurrency(c.totalPaid, clientCur)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Invoice list — shown when a client is selected ───────────────── */}
      {isFiltered && filteredInvoices.length > 0 && (
        <div className="card p-0 overflow-hidden mt-6">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">
              Invoices — {selectedClientName}
              <span className="text-gray-400 font-normal ml-1.5">({filteredInvoices.length})</span>
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">#</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Due</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Cur</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Amount</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Collected</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredInvoices.map((inv) => {
                  const cur        = inv.currency || 'INR';
                  const grandTotal = n(inv.grandTotal);
                  const amtPaid    = n(inv.amountPaid);
                  const balance    = n(inv.balanceDue ?? (grandTotal - amtPaid));
                  return (
                    <tr
                      key={inv._id}
                      className="hover:bg-slate-50 cursor-pointer transition-colors"
                      onClick={() => navigate(`/invoices/${inv._id}`)}
                    >
                      <td className="px-4 py-3 font-semibold text-primary-600 whitespace-nowrap">
                        {inv.invoiceNumber}
                      </td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{fmtDate(inv.invoiceDate)}</td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{fmtDate(inv.dueDate)}</td>
                      <td className="px-4 py-3"><StatusBadge status={inv.status} /></td>
                      <td className="px-4 py-3 text-slate-400 text-xs font-semibold">{cur}</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-900 whitespace-nowrap">
                        {fmtCurrency(grandTotal, cur)}
                      </td>
                      <td className="px-4 py-3 text-right text-emerald-700 whitespace-nowrap">
                        {fmtCurrency(amtPaid, cur)}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <span className={balance > 0 ? 'text-rose-600 font-medium' : 'text-slate-400'}>
                          {fmtCurrency(balance, cur)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
}
