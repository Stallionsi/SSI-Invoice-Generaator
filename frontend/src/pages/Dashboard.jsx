import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FileText, Users, TrendingUp, AlertCircle } from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { getInvoices } from '../api/invoices.api';
import { getClients } from '../api/clients.api';
import StatsCard from '../components/ui/StatsCard';
import StatusBadge from '../components/ui/StatusBadge';
import Spinner from '../components/ui/Spinner';
import { fmtCurrency, fmtDate } from '../utils/calculations';
import PageHeader from '../components/ui/PageHeader';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                     'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Safe number: returns finite number or 0
const n = (v) => (isFinite(+v) ? +v : 0);

// Safe date parse: returns Date or null
const parseDate = (d) => {
  if (!d) return null;
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? null : dt;
};

export default function Dashboard() {
  const navigate = useNavigate();

  // Fetch recent invoices for the widget + stat cards
  // Using limit:100 for client-side revenue computation (backend MAX_LIMIT = 100)
  const { data: invRes, isLoading: invLoading } = useQuery({
    queryKey: ['dashboard-invoices'],
    queryFn:  () => getInvoices({ limit: 100, sort: '-createdAt' }),
    staleTime: 60_000,
  });

  // Clients — only need pagination total
  const { data: clientsData } = useQuery({
    queryKey: ['clients', { limit: 1 }],
    queryFn:  () => getClients({ limit: 1 }),
    staleTime: 60_000,
  });

  // Overdue count — backend filter: dueDate < now AND status in sent/partial/overdue
  const { data: overdueData } = useQuery({
    queryKey: ['invoices-overdue-count'],
    queryFn:  () => getInvoices({ overdue: 'true', limit: 1 }),
    staleTime: 60_000,
  });

  // ── Extract raw data ───────────────────────────────────────────────────────
  const allInvoices    = invRes?.data?.data?.invoices || [];
  const totalInvoices  = invRes?.data?.pagination?.total  ?? 0;
  const totalClients   = clientsData?.data?.pagination?.total ?? 0;
  const overdueCount   = overdueData?.data?.pagination?.total ?? 0;
  const recentInvoices = allInvoices.slice(0, 5);

  // ── Revenue: sum grandTotal of PAID invoices only ─────────────────────────
  // Using grandTotal + status (NOT amountPaid) because amountPaid is only set
  // when payments are recorded via the Payment modal.
  const totalRevenue = useMemo(() => {
    return allInvoices
      .filter((inv) => inv.status?.toLowerCase() === 'paid')
      .reduce((sum, inv) => sum + n(inv.grandTotal), 0);
  }, [allInvoices]);

  // ── Chart: paid invoices grouped by month ─────────────────────────────────
  const chartData = useMemo(() => {
    const paid = allInvoices.filter((inv) => inv.status?.toLowerCase() === 'paid');
    const map  = {};

    paid.forEach((inv) => {
      const date = parseDate(inv.invoiceDate || inv.createdAt);
      if (!date) return;

      const m       = date.getMonth();        // 0-based
      const yr      = date.getFullYear();
      const sortKey = `${yr}${String(m + 1).padStart(2, '0')}`;
      const label   = `${MONTH_NAMES[m]} '${String(yr).slice(2)}`;

      if (!map[sortKey]) map[sortKey] = { label, revenue: 0, sortKey };
      map[sortKey].revenue += n(inv.grandTotal);
    });

    return Object.values(map).sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  }, [allInvoices]);

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Welcome back — here's your overview." />

      {/* ── Stat cards (all clickable) ─────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <StatsCard
          title="Total Revenue"
          value={invLoading ? '—' : fmtCurrency(totalRevenue)}
          icon={TrendingUp}
          color="green"
          onClick={() => navigate('/reports')}
        />
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
        {/* Overdue navigates to /invoices with ?status=overdue pre-filter */}
        <StatsCard
          title="Overdue"
          value={invLoading ? '—' : overdueCount}
          icon={AlertCircle}
          color="red"
          onClick={() => navigate('/invoices?status=overdue')}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* ── Monthly revenue chart ──────────────────────────────────────── */}
        <div className="card xl:col-span-2">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Monthly Revenue</h2>
          {invLoading ? (
            <div className="flex justify-center py-12"><Spinner /></div>
          ) : chartData.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <TrendingUp className="w-10 h-10 text-slate-200 mb-3" />
              <p className="text-sm text-slate-400">No revenue yet</p>
              <p className="text-xs text-slate-300 mt-1">
                Mark invoices as <strong>Paid</strong> to see revenue here
              </p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
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
                <Tooltip formatter={(v) => [fmtCurrency(v), 'Revenue']} />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#3b82f6"
                  fill="url(#colorRev)"
                  strokeWidth={2}
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* ── Recent invoices widget ─────────────────────────────────────── */}
        <div className="card">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Recent Invoices</h2>
          <div className="space-y-3">
            {recentInvoices.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-4">No invoices yet</p>
            ) : (
              recentInvoices.map((inv) => (
                <div
                  key={inv._id}
                  className="flex items-center justify-between text-sm cursor-pointer hover:bg-slate-50 -mx-2 px-2 py-1.5 rounded-lg transition-all duration-200"
                  onClick={() => navigate(`/invoices/${inv._id}`)}
                >
                  <div className="min-w-0 mr-2">
                    <p className="font-medium text-slate-800 truncate">{inv.invoiceNumber}</p>
                    <p className="text-xs text-slate-400">{fmtDate(inv.invoiceDate)}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-semibold text-slate-900">{fmtCurrency(inv.grandTotal, inv.currency)}</p>
                    <StatusBadge status={inv.status} />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
