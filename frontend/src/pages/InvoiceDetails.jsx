import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  ArrowLeft, Send, CreditCard, Download, Trash2, Pencil,
} from 'lucide-react';

import { getInvoice, deleteInvoice } from '../api/invoices.api';

import PageHeader from '../components/ui/PageHeader';
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

  const [showPayment, setShowPayment] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showSend, setShowSend] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['invoice', id],
    queryFn: () => getInvoice(id),
  });

  const inv = data?.data?.data?.invoice;

  const { mutate: doDelete, isPending: deleting } = useMutation({
    mutationFn: () => deleteInvoice(id),
    onSuccess: () => {
      toast.success('Invoice deleted');
      qc.invalidateQueries({ queryKey: ['invoices'] });
      navigate('/invoices');
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Delete failed'),
  });

  // Must be called here — before any early returns — to satisfy the Rules of Hooks
  const { fieldMap } = useCustomFields('invoice');

  if (isLoading)
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );

  if (!inv)
    return (
      <div className="text-center py-16 text-gray-400">
        Invoice not found
      </div>
    );

  // Payment must be recorded before the invoice email can be sent.
  const hasPayment = (inv.amountPaid || 0) > 0;
  const canPay     = !['paid', 'cancelled'].includes(inv.status);
  const canSend    = hasPayment && inv.status !== 'cancelled';
  const canDelete  = inv.status === 'draft';
  const canEdit    = !['paid', 'cancelled'].includes(inv.status);

  // Custom field definitions — used to render saved values with their labels
  const savedCustomFields = Object.entries(inv.customFields || {})
    .filter(([, v]) => v !== '' && v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0))
    .map(([key, value]) => ({ key, value, label: fieldMap.get(key)?.label || key }));

  const openPdf = () => {
    window.open(`/api/invoices/${id}/pdf`, '_blank');
  };

  return (
    <div>

      <PageHeader
        title={inv.invoiceNumber}
        subtitle={<StatusBadge status={inv.status} />}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn btn-secondary btn-sm" onClick={() => navigate(-1)}>
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Back</span>
            </button>

            {inv.status !== 'cancelled' && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => canSend && setShowSend(true)}
                disabled={!canSend}
                title={!canSend ? 'Record payment first to enable sending' : 'Send invoice email'}
              >
                <Send className="w-4 h-4" />
                <span className="hidden sm:inline">Send</span>
              </button>
            )}

            {canPay && (
              <button className="btn-primary btn-sm" onClick={() => setShowPayment(true)}>
                <CreditCard className="w-4 h-4" />
                <span className="hidden sm:inline">Record Payment</span>
              </button>
            )}

            <button className="btn btn-secondary btn-sm" onClick={openPdf}>
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">PDF</span>
            </button>

            {canEdit && (
              <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/invoices/${id}/edit`)}>
                <Pencil className="w-4 h-4" />
                <span className="hidden sm:inline">Edit</span>
              </button>
            )}

            {canDelete && (
              <button className="btn btn-danger btn-sm" onClick={() => setShowDelete(true)}>
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        }
      />

      {/* Payment-first notice — shown until at least one payment is recorded */}
      {!hasPayment && inv.status !== 'cancelled' && (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <CreditCard className="mt-0.5 w-4 h-4 flex-shrink-0" />
          <span>
            <strong>Record payment first.</strong> The Send button will be enabled once a payment is recorded against this invoice.
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        <div className="xl:col-span-2 space-y-6">

          <div className="card grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-gray-400 uppercase font-semibold mb-1">
                Bill To
              </p>
              <p className="font-semibold text-gray-900">
                {inv.client?.clientName || inv.recipientDetails?.name || '—'}
              </p>
              <p className="text-gray-500">
                {inv.client?.email || inv.recipientDetails?.email || ''}
              </p>
            </div>

            <div className="text-right">
              <p className="text-xs text-gray-400 uppercase font-semibold mb-1">
                Invoice Details
              </p>
              <p className="text-gray-700">
                Date: {fmtDate(inv.invoiceDate)}
              </p>
              <p className="text-gray-700">
                Due: {fmtDate(inv.dueDate)}
              </p>
              <p className="text-gray-700">
                Currency: {inv.currency}
              </p>
            </div>
          </div>

          <div className="card p-0 overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[480px]">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 md:px-6 py-3 text-xs font-semibold text-gray-500 uppercase">
                    Description
                  </th>
                  <th className="text-right px-4 md:px-6 py-3 text-xs font-semibold text-gray-500 uppercase">
                    Qty
                  </th>
                  <th className="text-right px-4 md:px-6 py-3 text-xs font-semibold text-gray-500 uppercase">
                    Unit Price
                  </th>
                  <th className="text-right px-4 md:px-6 py-3 text-xs font-semibold text-gray-500 uppercase">
                    Tax
                  </th>
                  <th className="text-right px-4 md:px-6 py-3 text-xs font-semibold text-gray-500 uppercase">
                    Total
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-50">
                {inv.lineItems?.map((item, i) => (
                  <tr key={i}>
                    <td className="px-6 py-4 text-gray-800">
                      {item.description}
                    </td>

                    <td className="px-6 py-4 text-right text-gray-600">
                      {item.quantity}
                    </td>

                    <td className="px-6 py-4 text-right text-gray-600">
                      {fmtCurrency(item.unitPrice, inv.currency)}
                    </td>

                    <td className="px-6 py-4 text-right text-gray-600">
                      {item.taxRate}%
                    </td>

                    <td className="px-6 py-4 text-right font-medium text-gray-900">
                      {fmtCurrency(item.amount, inv.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>

            <div className="px-4 md:px-6 py-4 border-t border-gray-100 flex justify-end">
              <div className="w-64 space-y-1 text-sm">

                <Row label="Subtotal" value={fmtCurrency(inv.subtotal, inv.currency)} />

                {inv.discountTotal > 0 &&
                  <Row label="Discount" value={`-${fmtCurrency(inv.discountTotal, inv.currency)}`} />
                }

                {inv.cgstTotal > 0 &&
                  <Row label="CGST" value={fmtCurrency(inv.cgstTotal, inv.currency)} />
                }

                {inv.sgstTotal > 0 &&
                  <Row label="SGST" value={fmtCurrency(inv.sgstTotal, inv.currency)} />
                }

                {inv.igstTotal > 0 &&
                  <Row label="IGST" value={fmtCurrency(inv.igstTotal, inv.currency)} />
                }

                <div className="border-t border-gray-200 pt-2 flex justify-between font-bold text-gray-900 text-base">
                  <span>Grand Total</span>
                  <span>{fmtCurrency(inv.grandTotal, inv.currency)}</span>
                </div>

              </div>
            </div>

          </div>

        </div>

        {/* Custom Fields — only shown when the invoice has saved values */}
        {savedCustomFields.length > 0 && (
          <div className="card space-y-3">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              Additional Fields
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
              {savedCustomFields.map(({ key, label, value }) => (
                <div key={key}>
                  <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-0.5">
                    {label}
                  </p>
                  <p className="text-gray-800">
                    {Array.isArray(value) ? value.join(', ') : String(value)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>

      <SendInvoiceModal
        open={showSend}
        onClose={() => setShowSend(false)}
        invoice={inv}
      />

      <PaymentModal
        open={showPayment}
        onClose={() => setShowPayment(false)}
        invoice={inv}
      />

      <ConfirmDialog
        open={showDelete}
        onClose={() => setShowDelete(false)}
        onConfirm={doDelete}
        loading={deleting}
        title="Delete Invoice"
        message={`Delete invoice ${inv.invoiceNumber}? This cannot be undone.`}
      />

    </div>
  );
}

function Row({ label, value, bold }) {
  return (
    <div className={`flex justify-between ${bold ? 'font-bold text-gray-900' : 'text-gray-600'}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}