import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  ArrowLeft, Send, CreditCard, Download, Trash2, Pencil,
  FileText, Calendar, User, Building2,
} from 'lucide-react';

import { getInvoice, deleteInvoice } from '../api/invoices.api';
import { useAuthStore } from '../store/authStore';

import StatusBadge from '../components/ui/StatusBadge';
import PaymentModal from '../components/payment/PaymentModal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import SendInvoiceModal from '../components/invoice/SendInvoiceModal';
import Spinner from '../components/ui/Spinner';

import { fmtCurrency, fmtDate } from '../utils/calculations';
import { useCustomFields } from '../hooks/useCustomFields';

export default function InvoiceDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const selectedCompanyId = useAuthStore((s) => s.selectedCompanyId);

  const [showPayment, setShowPayment] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showSend, setShowSend] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['invoice', id],
    queryFn: () => getInvoice(id),
  });

  const inv = data?.data?.data?.invoice;

  // Direct URL for PDF — passed as an <a> href so the click is a real user
  // gesture and bypasses Chrome's async-context download block.
  const pdfUrl = selectedCompanyId
    ? `/api/invoices/${id}/pdf?companyId=${selectedCompanyId}`
    : `/api/invoices/${id}/pdf`;

  const { mutate: doDelete, isPending: deleting } = useMutation({
    mutationFn: () => deleteInvoice(id),
    onSuccess: () => {
      toast.success('Invoice deleted');
      qc.invalidateQueries({ queryKey: ['invoices'] });
      navigate('/invoices');
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Delete failed'),
  });


  const { fieldMap } = useCustomFields('invoice');

  if (isLoading)
    return <div className="flex justify-center py-16"><Spinner /></div>;

  if (!inv)
    return <div className="text-center py-16 text-gray-400">Invoice not found</div>;

  const hasPayment = (inv.amountPaid || 0) > 0;
  const canPay    = !['paid', 'cancelled'].includes(inv.status);
  const canSend   = inv.status !== 'cancelled';
  const canDelete = inv.status !== 'paid';
  const canEdit   = !['paid', 'cancelled'].includes(inv.status);
  const clientName = inv.client?.clientName || inv.recipientDetails?.name || '—';

  const savedCustomFields = Object.entries(inv.customFields || {})
    .filter(([, v]) => v !== '' && v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0))
    .map(([key, value]) => ({ key, value, label: fieldMap.get(key)?.label || key }));

  return (
    <div className="space-y-6">

      {/* ── Hero header ────────────────────────────────────────────────── */}
      <div
        className="rounded-2xl p-6 relative overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, #1E1B4B 0%, #4F46E5 55%, #6366F1 100%)',
          boxShadow: '0 8px 32px rgba(99,102,241,0.30)',
        }}
      >
        {/* Decorative blobs */}
        <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full opacity-10" style={{ background: 'white' }} />
        <div className="absolute -bottom-12 right-20 w-32 h-32 rounded-full opacity-10" style={{ background: 'white' }} />

        <div className="relative">
          {/* Top row: back + actions */}
          <div className="flex items-center justify-between gap-3 mb-5">
            <button
              className="flex items-center gap-1.5 h-8 px-3 rounded-xl text-xs font-semibold bg-white/20 hover:bg-white/30 text-white border border-white/20 transition-all"
              onClick={() => navigate(-1)}
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back
            </button>

            <div className="flex items-center gap-2 flex-wrap justify-end">
              {inv.status !== 'cancelled' && (
                <button
                  className="flex items-center gap-1.5 h-8 px-3 rounded-xl text-xs font-semibold bg-white/20 hover:bg-white/30 text-white border border-white/20 transition-all disabled:opacity-40"
                  onClick={() => canSend && setShowSend(true)}
                  disabled={!canSend}
                  title="Send invoice email"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Send</span>
                </button>
              )}

              <a
                href={pdfUrl}
                download={`invoice-${inv?.invoiceNumber || id}.pdf`}
                className="flex items-center gap-1.5 h-8 px-3 rounded-xl text-xs font-semibold bg-white/20 hover:bg-white/30 text-white border border-white/20 transition-all"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">PDF</span>
              </a>

              {canEdit && (
                <button
                  className="flex items-center gap-1.5 h-8 px-3 rounded-xl text-xs font-semibold bg-white/20 hover:bg-white/30 text-white border border-white/20 transition-all"
                  onClick={() => navigate(`/invoices/${id}/edit`)}
                >
                  <Pencil className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Edit</span>
                </button>
              )}

              {canDelete && (
                <button
                  className="flex items-center gap-1.5 h-8 px-3 rounded-xl text-xs font-semibold transition-all"
                  style={{ background: 'rgba(244,63,94,0.25)', border: '1px solid rgba(244,63,94,0.4)', color: '#FCA5A5' }}
                  onClick={() => setShowDelete(true)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}

              {canPay && (
                <button
                  className="flex items-center gap-1.5 h-8 px-4 rounded-xl text-xs font-bold transition-all"
                  style={{ background: 'white', color: '#4F46E5', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}
                  onClick={() => setShowPayment(true)}
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Record Payment</span>
                </button>
              )}
            </div>
          </div>

          {/* Invoice info */}
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex items-center gap-4">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: 'rgba(255,255,255,0.20)', border: '2px solid rgba(255,255,255,0.25)' }}
              >
                <FileText className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-indigo-200 text-xs font-semibold uppercase tracking-widest mb-1">Invoice</p>
                <h1 className="text-2xl font-extrabold text-white tracking-tight">{inv.invoiceNumber}</h1>
                <div className="mt-1"><StatusBadge status={inv.status} /></div>
              </div>
            </div>

            <div className="flex flex-wrap gap-4 text-sm">
              <div className="flex items-center gap-2 text-indigo-200">
                <User className="w-3.5 h-3.5" />
                <span className="font-semibold text-white">{clientName}</span>
              </div>
              <div className="flex items-center gap-2 text-indigo-200">
                <Calendar className="w-3.5 h-3.5" />
                <span>{fmtDate(inv.invoiceDate)}</span>
              </div>
              <div
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl font-bold text-white"
                style={{ background: 'rgba(255,255,255,0.15)' }}
              >
                {fmtCurrency(inv.grandTotal, inv.currency)}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        <div className="xl:col-span-2 space-y-6">

          {/* Bill-to + invoice meta */}
          <div className="card">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-sm">
              <div>
                <p className="text-[11px] font-bold text-indigo-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                  <User className="w-3 h-3" /> Bill To
                </p>
                <p className="font-bold text-gray-900 text-base">{clientName}</p>
                <p className="text-gray-500 mt-0.5">{inv.client?.email || inv.recipientDetails?.email || ''}</p>
              </div>
              <div className="sm:text-right">
                <p className="text-[11px] font-bold text-indigo-400 uppercase tracking-widest mb-2 flex items-center gap-1.5 sm:justify-end">
                  <Building2 className="w-3 h-3" /> Invoice Details
                </p>
                <div className="space-y-1 text-gray-600">
                  <p><span className="text-gray-400 text-xs">Date: </span><span className="font-medium text-gray-800">{fmtDate(inv.invoiceDate)}</span></p>
                  <p><span className="text-gray-400 text-xs">Due: </span><span className="font-medium text-gray-800">{fmtDate(inv.dueDate)}</span></p>
                  <p><span className="text-gray-400 text-xs">Currency: </span><span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold bg-indigo-50 text-indigo-700">{inv.currency}</span></p>
                </div>
              </div>
            </div>
          </div>

          {/* Line items table */}
          <div className="card p-0 overflow-hidden">
            <div className="px-6 py-4" style={{ borderBottom: '2px solid #EEF2FF' }}>
              <h2 className="text-sm font-bold text-gray-900">Line Items</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="table-premium w-full text-sm min-w-[480px]">
                <thead>
                  <tr>
                    <th>Description</th>
                    <th className="text-right">Qty</th>
                    <th className="text-right">Unit Price</th>
                    <th className="text-right">Tax</th>
                    <th className="text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {inv.lineItems?.map((item, i) => (
                    <tr key={i} style={{ cursor: 'default' }}>
                      <td className="text-gray-800 font-medium">{item.description}</td>
                      <td className="text-right text-gray-600">{item.quantity}</td>
                      <td className="text-right text-gray-600">{fmtCurrency(item.unitPrice, inv.currency)}</td>
                      <td className="text-right text-gray-500">{item.taxRate}%</td>
                      <td className="text-right font-bold text-gray-900">{fmtCurrency(item.amount, inv.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals block */}
            <div className="px-6 py-5" style={{ borderTop: '2px solid #EEF2FF', background: '#FAFAFE' }}>
              <div className="ml-auto w-72 space-y-2 text-sm">
                <TotalRow label="Subtotal" value={fmtCurrency(inv.subtotal, inv.currency)} />
                {inv.discountTotal > 0 && (
                  <TotalRow label="Discount" value={`-${fmtCurrency(inv.discountTotal, inv.currency)}`} colored="green" />
                )}
                {inv.cgstTotal > 0 && <TotalRow label="CGST" value={fmtCurrency(inv.cgstTotal, inv.currency)} />}
                {inv.sgstTotal > 0 && <TotalRow label="SGST" value={fmtCurrency(inv.sgstTotal, inv.currency)} />}
                {inv.igstTotal > 0 && <TotalRow label="IGST" value={fmtCurrency(inv.igstTotal, inv.currency)} />}
                <div
                  className="flex items-center justify-between font-extrabold text-base rounded-xl px-4 py-3 mt-3"
                  style={{ background: 'linear-gradient(135deg, #EEF2FF, #F5F3FF)', color: '#3730A3' }}
                >
                  <span>Grand Total</span>
                  <span>{fmtCurrency(inv.grandTotal, inv.currency)}</span>
                </div>
                {hasPayment && (
                  <>
                    <TotalRow label="Amount Paid" value={fmtCurrency(inv.amountPaid, inv.currency)} colored="green" />
                    <TotalRow
                      label="Balance Due"
                      value={fmtCurrency((inv.balanceDue ?? (inv.grandTotal - inv.amountPaid)), inv.currency)}
                      colored="red"
                    />
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Notes */}
          {inv.notes && (
            <div className="card">
              <p className="text-[11px] font-bold text-indigo-400 uppercase tracking-widest mb-2">Notes</p>
              <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">{inv.notes}</p>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">

          {/* Payment summary */}
          <div className="card space-y-3">
            <h3 className="text-sm font-bold text-gray-900">Payment Summary</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Invoice Total</span>
                <span className="font-bold text-gray-900">{fmtCurrency(inv.grandTotal, inv.currency)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Paid</span>
                <span className="font-semibold text-emerald-600">{fmtCurrency(inv.amountPaid || 0, inv.currency)}</span>
              </div>
              <div
                className="flex justify-between rounded-lg px-3 py-2 font-bold text-sm"
                style={{ background: '#FFF1F2', color: '#9F1239' }}
              >
                <span>Balance Due</span>
                <span>{fmtCurrency(inv.balanceDue ?? (inv.grandTotal - (inv.amountPaid || 0)), inv.currency)}</span>
              </div>
            </div>
            {canPay && (
              <button
                className="btn-primary w-full justify-center mt-1"
                onClick={() => setShowPayment(true)}
              >
                <CreditCard className="w-4 h-4" /> Record Payment
              </button>
            )}
          </div>

          {/* Custom fields */}
          {savedCustomFields.length > 0 && (
            <div className="card space-y-3">
              <h3 className="text-[11px] font-bold text-indigo-400 uppercase tracking-widest">Additional Fields</h3>
              <div className="space-y-3 text-sm">
                {savedCustomFields.map(({ key, label, value }) => (
                  <div key={key}>
                    <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-0.5">{label}</p>
                    <p className="text-gray-800 font-medium">
                      {Array.isArray(value) ? value.join(', ') : String(value)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <SendInvoiceModal open={showSend} onClose={() => setShowSend(false)} invoice={inv} />
      <PaymentModal open={showPayment} onClose={() => setShowPayment(false)} invoice={inv} />
      <ConfirmDialog
        open={showDelete}
        onClose={() => setShowDelete(false)}
        onConfirm={doDelete}
        loading={deleting}
        title="Delete Invoice"
        message={`Permanently delete invoice ${inv.invoiceNumber} from the database? This cannot be undone.`}
      />
    </div>
  );
}

function TotalRow({ label, value, colored }) {
  const color = colored === 'green'
    ? 'text-emerald-600'
    : colored === 'red'
    ? 'text-rose-600 font-semibold'
    : 'text-gray-600';
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-500">{label}</span>
      <span className={`font-semibold ${color}`}>{value}</span>
    </div>
  );
}
