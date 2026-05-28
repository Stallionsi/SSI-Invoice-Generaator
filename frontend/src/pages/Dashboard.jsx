import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FileText, Users, TrendingUp, AlertCircle } from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { getInvoices } from '../api/invoices.api';
import { getClients } from '../api/clients.api';
import { useAuthStore } from '../store/authStore';
import StatsCard from '../components/ui/StatsCard';
import StatusBadge from '../components/ui/StatusBadge';
import Spinner from '../components/ui/Spinner';
import { fmtCurrency, fmtDate } from '../utils/calculations';
import PageHeader from '../components/ui/PageHeader';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                     'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const n = (v) => (isFinite(+v) ? +v : 0);

const parseDate = (d) => {
  if (!d) return null;
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? null : dt;
};

// Format a compact number with currency symbol, no full locale formatting
function fmtCompact(amount, currency) {
  const sym = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : '₹';
  if (amount >= 1_00_00_000) return `${sym}${(amount / 1_00_00_000).toFixed(1)}Cr`;
  if (amount >= 1_00_000)    return `${sym}${(amount / 1_00_000).toFixed(1)}L`;
  if (amount >= 1_000)       return `${sym}${(amount / 1_000).toFixed(1)}k`;
  return fmtCurrency(amount, currency);
}

export default function Dashboard() {
  const navigate = useNavigate();
  const activeId = useAuthStore((s) => s.selectedCompanyId);

  const { data: invRes, isLoading: invLoading } = useQuery({
    queryKey: ['dashboard-invoices', activeId],
    queryFn:  () => getInvoices({ limit: 100, sort: '-createdAt' }),
    staleTime: 60_000,
  });

  const { data: clientsData } = useQuery({
    queryKey: ['clients', activeId, { limit: 1 }],
    queryFn:  () => getClients({ limit: 1 }),
    staleTime: 60_000,
  });

  const { data: overdueData } = useQuery({
    queryKey: ['invoices-overdue-count', activeId],
    queryFn:  () => getInvoices({ overdue: 'true', limit: 1 }),
    staleTime: 60_000,
  });

  const allInvoices   = invRes?.data?.data?.invoices || [];
  const totalInvoices = invRes?.data?.pagination?.total ?? 0;
  const totalClients  = clientsData?.data?.pagination?.total ?? 0;
  const overdueCount  = overdueData?.data?.pagination?.total ?? 0;
  const recentInvoices = allInvoices.slice(0, 5);

  // ── Dominant currency across ALL non-cancelled invoices ─────────────────────
  // Used as fallback when there are no paid invoices yet, so the UI shows
  // the correct symbol (e.g. $ not ₹) for a USD-only company.
  const dominantCurrency = useMemo(() => {
    const freq = {};
    allInvoices
      .filter((inv) => (inv.status?.toLowerCase() || '') !== 'cancelled')
      .forEach((inv) => {
        const cur = inv.currency || 'INR';
        freq[cur] = (freq[cur] || 0) + 1;
      });
    const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
    return sorted[0]?.[0] || 'INR';
  }, [allInvoices]);

  // ── Revenue grouped by currency (all sent invoices — sent/overdue/partial/paid) ───
  const revenuesByCurrency = useMemo(() => {
    const map = {};
    allInvoices
      .filter((inv) => !['draft', 'cancelled'].includes(inv.status?.toLowerCase()))
      .forEach((inv) => {
        const cur = inv.currency || 'INR';
        map[cur] = (map[cur] || 0) + n(inv.grandTotal);
      });
    // Sort: INR first if present, then alphabetical
    return Object.entries(map)
      .map(([currency, total]) => ({ currency, total }))
      .sort((a, b) => {
        if (a.currency === 'INR') return -1;
        if (b.currency === 'INR') return 1;
        return a.currency.localeCompare(b.currency);
      });
  }, [allInvoices]);

  // ── Draft + outstanding totals by currency (for pipeline row) ────────────
  const pipelineByCurrency = useMemo(() => {
    const map = {};
    allInvoices.forEach((inv) => {
      const s   = (inv.status || '').toLowerCase();
      if (s === 'cancelled') return;
      const cur = inv.currency || 'INR';
      const amt = n(inv.grandTotal);
      if (!map[cur]) map[cur] = { draft: 0, outstanding: 0, collected: 0 };
      if (s === 'draft')      map[cur].draft       += amt;
      else if (s === 'paid')  map[cur].collected   += amt;
      else                    map[cur].outstanding += amt; // sent / overdue
    });
    return map;
  }, [allInvoices]);

  // All unique currencies in paid invoices — for the chart tab selector
  const paidCurrencies = useMemo(
    () => revenuesByCurrency.map((r) => r.currency),
    [revenuesByCurrency],
  );

  // Selected currency for the chart (default: first paid currency, then dominant)
  const [chartCurrency, setChartCurrency] = useState(null);
  const activeCurrency = chartCurrency ?? paidCurrencies[0] ?? dominantCurrency;

  // ── Chart: sent invoices for the selected currency, grouped by month ─────────
  const chartData = useMemo(() => {
    const paid = allInvoices.filter(
      (inv) => !['draft', 'cancelled'].includes(inv.status?.toLowerCase()) &&
               (inv.currency || 'INR') === activeCurrency,
    );
    const map = {};

    paid.forEach((inv) => {
      const date = parseDate(inv.invoiceDate || inv.createdAt);
      if (!date) return;
      const m       = date.getMonth();
      const yr      = date.getFullYear();
      const sortKey = `${yr}${String(m + 1).padStart(2, '0')}`;
      const label   = `${MONTH_NAMES[m]} '${String(yr).slice(2)}`;
      if (!map[sortKey]) map[sortKey] = { label, revenue: 0, sortKey };
      map[sortKey].revenue += n(inv.grandTotal);
    });

    return Object.values(map).sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  }, [allInvoices, activeCurrency]);

  // Revenue stat card value: single currency → formatted amount; multi → stacked lines
  const revenueDisplay = useMemo(() => {
    if (invLoading) return '—';
    // No paid invoices yet → show $0 / ₹0 using the dominant currency in the system
    if (revenuesByCurrency.length === 0) return fmtCurrency(0, dominantCurrency);
    if (revenuesByCurrency.length === 1)
      return fmtCurrency(revenuesByCurrency[0].total, revenuesByCurrency[0].currency);
    // Multi-currency: return first + note
    return revenuesByCurrency
      .map((r) => fmtCurrency(r.total, r.currency))
      .join(' · ');
  }, [invLoading, revenuesByCurrency, dominantCurrency]);

  // Tooltip Y-axis formatter for chart
  const chartFmt = (v) => [fmtCurrency(v, activeCurrency), 'Revenue'];
  const yFmt = (v) =>
    v >= 1_00_00_000 ? `${(v / 1_00_00_000).toFixed(1)}Cr`
    : v >= 1_00_000  ? `${(v / 1_00_000).toFixed(1)}L`
    : v >= 1_000     ? `${(v / 1_000).toFixed(0)}k`
    : v;

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Welcome back — here's your overview." />

      {/* ── Stat cards ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">

        {/* Revenue — expands to show all currencies when mixed */}
        {invLoading || revenuesByCurrency.length <= 1 ? (
          <StatsCard
            title="Total Revenue"
            value={revenueDisplay}
            subtitle={revenuesByCurrency.length === 1 ? `${revenuesByCurrency[0].currency} · sent invoices` : undefined}
            icon={TrendingUp}
            color="green"
            onClick={() => navigate('/reports')}
          />
        ) : (
          /* Multi-currency: one mini card per currency */
          revenuesByCurrency.map((r, i) => (
            <StatsCard
              key={r.currency}
              title={i === 0 ? 'Revenue (sent)' : `Revenue · ${r.currency}`}
              value={fmtCurrency(r.total, r.currency)}
              subtitle={r.currency}
              icon={TrendingUp}
              color="green"
              onClick={() => navigate('/reports')}
            />
          ))
        )}

        <StatsCard
          title="Invoices"
          value={invLoading ? '—' : totalInvoices}
          icon={FileText}
          color="blue"
          onClick={() => navigate('/invoices')}
        />
        <StatsCard
          title="Clients"
          value={invLoading ? '—' : totalClients}
          icon={Users}
          color="teal"
          onClick={() => navigate('/clients')}
        />
        <StatsCard
          title="Overdue"
          value={invLoading ? '—' : overdueCount}
          icon={AlertCircle}
          color="red"
          onClick={() => navigate('/invoices?overdue=true')}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* ── Revenue chart ──────────────────────────────────────────────── */}
        <div className="card xl:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
            <div>
              <h2 className="text-base font-bold text-gray-900">Revenue Overview</h2>
              <p className="text-xs text-gray-400 mt-0.5">Paid invoices by month</p>
            </div>

            {/* Currency tab selector — only shown when there are multiple currencies */}
            {paidCurrencies.length > 1 && (
              <div
                className="flex items-center gap-1 p-1 rounded-xl"
                style={{ background: '#F3F4F6' }}
              >
                {paidCurrencies.map((cur) => (
                  <button
                    key={cur}
                    onClick={() => setChartCurrency(cur)}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-150"
                    style={
                      activeCurrency === cur
                        ? { background: 'white', color: '#4F46E5', boxShadow: '0 1px 4px rgba(0,0,0,0.10)' }
                        : { color: '#9CA3AF' }
                    }
                  >
                    {cur}
                  </button>
                ))}
              </div>
            )}

            {paidCurrencies.length <= 1 && (
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#6366F1' }} />
                <span className="text-xs text-gray-500 font-medium">
                  {activeCurrency} Revenue
                </span>
              </div>
            )}
          </div>

          {invLoading ? (
            <div className="flex justify-center py-12"><Spinner /></div>
          ) : chartData.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <TrendingUp className="w-10 h-10 mb-3" style={{ color: '#E0E7FF' }} />
              <p className="text-sm text-gray-400 font-medium">No {activeCurrency} revenue yet</p>
              <p className="text-xs text-gray-300 mt-1">
                Mark invoices as <strong>Sent</strong> to see revenue here
              </p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#6366F1" stopOpacity={0.18} />
                    <stop offset="95%" stopColor="#6366F1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: '#9CA3AF' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#9CA3AF' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={yFmt}
                />
                <Tooltip
                  formatter={chartFmt}
                  contentStyle={{
                    borderRadius: 12,
                    border: '1px solid #EEF2FF',
                    boxShadow: '0 4px 16px rgba(99,102,241,0.12)',
                    fontSize: 12,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#6366F1"
                  fill="url(#colorRev)"
                  strokeWidth={2.5}
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}

          {/* ── Pipeline summary row (always visible) ─────────────────────── */}
          {!invLoading && (() => {
            const p = pipelineByCurrency[activeCurrency] || { collected: 0, draft: 0, outstanding: 0 };
            return (
              <div
                className="mt-4 pt-4 grid grid-cols-3 gap-2 text-center"
                style={{ borderTop: '1px solid #F3F4F6' }}
              >
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-500 mb-0.5">Collected</p>
                  <p className="text-sm font-extrabold text-gray-800 tabular-nums">
                    {fmtCompact(p.collected, activeCurrency)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider mb-0.5" style={{ color: '#6366F1' }}>Draft</p>
                  <p className="text-sm font-extrabold tabular-nums" style={{ color: '#4338CA' }}>
                    {fmtCompact(p.draft, activeCurrency)}
                  </p>
                  {p.draft > 0 && (
                    <p className="text-[9px] text-gray-400 leading-tight">pipeline</p>
                  )}
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-amber-500 mb-0.5">Outstanding</p>
                  <p className="text-sm font-extrabold text-gray-800 tabular-nums">
                    {fmtCompact(p.outstanding, activeCurrency)}
                  </p>
                </div>
              </div>
            );
          })()}
        </div>

        {/* ── Recent invoices ────────────────────────────────────────────── */}
        <div className="card">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-base font-bold text-gray-900">Recent Invoices</h2>
              <p className="text-xs text-gray-400 mt-0.5">Latest activity</p>
            </div>
            <button
              className="text-xs font-semibold text-primary-600 hover:text-primary-700"
              onClick={() => navigate('/invoices')}
            >
              View all →
            </button>
          </div>
          <div className="space-y-1">
            {recentInvoices.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-6">No invoices yet</p>
            ) : (
              recentInvoices.map((inv) => {
                const clientName = inv.client?.clientName || inv.recipientDetails?.name || '—';
                return (
                  <div
                    key={inv._id}
                    className="flex items-center justify-between text-sm cursor-pointer hover:bg-indigo-50/50 -mx-3 px-3 py-2.5 rounded-xl transition-all duration-150"
                    onClick={() => navigate(`/invoices/${inv._id}`)}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 mr-2">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                        style={{ background: 'linear-gradient(135deg, #6366F1, #4F46E5)' }}
                      >
                        {clientName.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-800 truncate text-xs">{inv.invoiceNumber}</p>
                        <p className="text-[11px] text-gray-400 truncate">{clientName}</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      {/* Always show the invoice's own currency */}
                      <p className="font-bold text-gray-900 text-xs">
                        {fmtCurrency(inv.grandTotal, inv.currency)}
                      </p>
                      <div className="mt-0.5"><StatusBadge status={inv.status} /></div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
