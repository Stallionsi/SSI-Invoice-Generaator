import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Pencil, Trash2, Mail, Phone, Globe, Building2,
  CreditCard, FileText, MapPin, Calendar, TrendingUp, Clock,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { getClient, deleteClient } from '../api/clients.api';
import { customFieldsApi } from '../api/customFields.api';
import Spinner from '../components/ui/Spinner';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { useState } from 'react';

// ─── Value display helpers ─────────────────────────────────────────────────────

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : null;

const fmtCurrency = (n, cur = 'INR') =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: cur, maximumFractionDigits: 2 }).format(n || 0);

const renderCustomValue = (value, fieldType, fieldDef) => {
  const isEmpty = (v) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
  if (isEmpty(value)) return '—';

  // Multiselect / checkbox with options → render as tag chips
  if (Array.isArray(value)) {
    if (!value.length) return '—';
    const opts = fieldDef?.options || [];
    return (
      <div className="flex flex-wrap gap-1">
        {value.map((v) => {
          const opt = opts.find((o) => o.value === v);
          return (
            <span key={v} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
              {opt?.label || v}
            </span>
          );
        })}
      </div>
    );
  }

  switch (fieldType) {
    case 'boolean':
      return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${value ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
          {value ? 'Yes' : 'No'}
        </span>
      );
    case 'email':
      return <a href={`mailto:${value}`} className="text-blue-600 hover:underline">{value}</a>;
    case 'phone':
      return <a href={`tel:${value}`} className="text-blue-600 hover:underline">{value}</a>;
    case 'url': {
      const href = /^https?:\/\//i.test(value) ? value : `https://${value}`;
      return <a href={href} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline max-w-xs block truncate">{value}</a>;
    }
    case 'date':
      return fmtDate(value) || value;
    case 'datetime':
      return new Date(value).toLocaleString('en-IN') || value;
    case 'currency':
      return typeof value === 'number' ? fmtCurrency(value) : value;
    case 'percentage':
      return `${value}%`;
    case 'autoCode':
    case 'refId':
      return <span className="font-mono text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded">{value}</span>;
    case 'dropdown':
    case 'select':
    case 'radio': {
      // Map value back to label if options are available
      const opt = (fieldDef?.options || []).find((o) => o.value === value);
      return opt?.label || String(value);
    }
    default:
      return String(value);
  }
};

// ─── Small reusable pieces ─────────────────────────────────────────────────────

function InfoRow({ label, children }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{label}</span>
      <span className="text-sm text-gray-800">{children ?? '—'}</span>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color = 'blue' }) {
  const colors = {
    blue:   'bg-primary-50  text-primary-700',
    green:  'bg-emerald-50  text-emerald-700',
    amber:  'bg-amber-50    text-amber-700',
    purple: 'bg-teal-50     text-teal-700',
  };
  return (
    <div className="card flex items-center gap-4 py-4">
      <div className={`p-2.5 rounded-lg ${colors[color]}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
        <p className="text-lg font-semibold text-gray-900">{value}</p>
      </div>
    </div>
  );
}

// ─── Country-aware tax information display ────────────────────────────────────

function TaxInfoSection({ client }) {
  const country = client.country || 'India';
  const ti      = client.taxIdentifiers || {};

  // SSN arrives pre-masked from the server (e.g. "XXX-XX-6789")
  console.log('CLIENT DATA:', { id: client._id, country, taxIdentifiers: ti });

  let rows = [];

  if (country === 'India') {
    rows = [
      { label: 'GST Number', value: ti.gstNumber || client.gstNumber },
      { label: 'PAN Number', value: ti.panNumber || client.panNumber },
    ];
  } else if (country === 'United States') {
    rows = [
      { label: 'EIN',          value: ti.ein },
      { label: 'State Tax ID', value: ti.stateTaxId },
      // SSN is already masked server-side → display as monospace
      { label: 'SSN',          value: ti.ssn || null, sensitive: true },
    ];
  } else if (['United Kingdom', 'Germany', 'France'].includes(country)) {
    rows = [
      { label: 'VAT Number', value: ti.vatNumber },
    ];
  } else if (ti.taxLabel || ti.taxValue) {
    rows = [
      { label: ti.taxLabel || 'Tax ID', value: ti.taxValue },
    ];
  }

  return (
    <div className="card space-y-4">
      <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
        <CreditCard className="w-4 h-4 text-slate-400" />
        Tax Information
        <span className="ml-1 text-xs font-normal text-slate-400">({country})</span>
      </h2>
      {rows.map(({ label, value, sensitive }) => (
        <InfoRow key={label} label={label}>
          {value
            ? <span className={sensitive ? 'font-mono text-sm tracking-widest text-slate-500' : undefined}>{value}</span>
            : null}
        </InfoRow>
      ))}
      <InfoRow label="Currency">{client.currency || 'INR'}</InfoRow>
      <InfoRow label="Payment Terms">{client.paymentTerms}</InfoRow>
    </div>
  );
}

function AddressBlock({ address }) {
  if (!address) return <span className="text-sm text-gray-400">—</span>;
  const parts = [address.line1, address.line2, address.city, address.state, address.pincode, address.country]
    .filter(Boolean);
  if (!parts.length) return <span className="text-sm text-gray-400">—</span>;
  return (
    <div className="text-sm text-gray-700 leading-relaxed">
      {parts.map((p, i) => <span key={i}>{p}{i < parts.length - 1 ? ', ' : ''}</span>)}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ClientDetail() {
  const { id }   = useParams();
  const navigate = useNavigate();
  const qc       = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);

  // All hooks before any early return
  const { data: clientData, isLoading } = useQuery({
    queryKey: ['client', id],
    queryFn:  () => getClient(id),
  });

  const { data: fieldsData } = useQuery({
    queryKey: ['custom-fields', 'client'],
    queryFn:  () => customFieldsApi.list('client'),
    select:   (res) => res.data?.data?.fields ?? [],
  });

  const { mutate: doDelete, isPending: deleting } = useMutation({
    mutationFn: () => deleteClient(id),
    onSuccess: () => {
      toast.success('Client deleted');
      qc.invalidateQueries({ queryKey: ['clients'] });
      navigate('/clients');
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Delete failed'),
  });

  if (isLoading) return <div className="flex justify-center py-16"><Spinner /></div>;

  const client    = clientData?.data?.data?.client;
  const fieldDefs = fieldsData ?? [];

  if (!client) {
    return (
      <div className="text-center py-16 text-gray-500">
        Client not found. <button className="text-blue-600 underline" onClick={() => navigate('/clients')}>Go back</button>
      </div>
    );
  }

  // Build custom field entries — iterate values as primary source so fields
  // render even if the field-definitions query hasn't resolved yet.
  const customEntries = Object.entries(client.customFields || {})
    .filter(([, v]) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0))
    .map(([key, value]) => {
      const def = fieldDefs.find((f) => f.key === key);
      return { key, label: def?.label || key, value, fieldType: def?.fieldType || 'text', fieldDef: def };
    });

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <button className="btn btn-secondary mt-0.5" onClick={() => navigate('/clients')}>
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{client.clientName}</h1>
            {client.companyName && <p className="text-sm text-gray-500 mt-0.5">{client.companyName}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            className="btn btn-secondary"
            onClick={() => navigate(`/clients/${id}/edit`)}
          >
            <Pencil className="w-4 h-4" /> Edit
          </button>
          <button
            className="btn btn-danger"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="w-4 h-4" /> Delete
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={FileText}   label="Total Invoices" value={client.stats?.totalInvoices ?? 0} color="blue" />
        <StatCard icon={TrendingUp} label="Total Revenue"  value={fmtCurrency(client.stats?.totalRevenue, client.currency)} color="green" />
        <StatCard icon={Clock}      label="Pending"        value={fmtCurrency(client.stats?.pendingAmount, client.currency)} color="amber" />
        <StatCard icon={Calendar}   label="Last Invoice"   value={fmtDate(client.stats?.lastInvoiceDate) || 'Never'} color="purple" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Contact Information */}
        <div className="card space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Mail className="w-4 h-4 text-gray-400" /> Contact Information
          </h2>
          <InfoRow label="Email">
            {client.email
              ? <a href={`mailto:${client.email}`} className="text-blue-600 hover:underline">{client.email}</a>
              : null}
          </InfoRow>
          <InfoRow label="Phone">
            {client.phone
              ? <a href={`tel:${client.phone}`} className="text-blue-600 hover:underline">{client.phone}</a>
              : null}
          </InfoRow>
          {client.alternatePhone && (
            <InfoRow label="Alternate Phone">
              <a href={`tel:${client.alternatePhone}`} className="text-blue-600 hover:underline">{client.alternatePhone}</a>
            </InfoRow>
          )}
        </div>

        {/* Tax Information — country-aware */}
        <TaxInfoSection client={client} />

        {/* Billing Address */}
        <div className="card space-y-3">
          <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-gray-400" /> Billing Address
          </h2>
          <AddressBlock address={client.billingAddress} />
        </div>

        {/* Shipping Address */}
        <div className="card space-y-3">
          <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-gray-400" /> Shipping Address
          </h2>
          <AddressBlock address={client.shippingAddress} />
        </div>
      </div>

      {/* Custom Fields */}
      {customEntries.length > 0 && (
        <div className="card space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">Additional Fields</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {customEntries.map((entry) => (
              <InfoRow key={entry.label} label={entry.label}>
                {renderCustomValue(entry.value, entry.fieldType, entry.fieldDef)}
              </InfoRow>
            ))}
          </div>
        </div>
      )}

      {/* Notes */}
      {client.notes && (
        <div className="card space-y-2">
          <h2 className="text-sm font-semibold text-gray-700">Notes</h2>
          <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">{client.notes}</p>
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={doDelete}
        loading={deleting}
        title="Delete Client"
        message={`Are you sure you want to delete "${client.clientName}"? This cannot be undone.`}
      />
    </div>
  );
}
