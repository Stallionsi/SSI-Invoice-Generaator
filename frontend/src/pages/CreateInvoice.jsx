import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ArrowLeft } from 'lucide-react';
import { createInvoice, getNextInvoiceNumber } from '../api/invoices.api';
import { getClients, getClient } from '../api/clients.api';
import LineItemEditor from '../components/invoice/LineItemEditor';
import InvoiceTotals from '../components/invoice/InvoiceTotals';
import PageHeader from '../components/ui/PageHeader';
import Spinner from '../components/ui/Spinner';
import { calcInvoiceTotals } from '../utils/calculations';
import SimpleCustomFields from '../components/customFields/SimpleCustomFields';

// ─── Zod schemas ───────────────────────────────────────────────────────────────
const itemSchema = z.object({
  description: z.string().min(1, 'Required'),
  quantity:    z.number().positive(),
  unitPrice:   z.number().min(0),
  taxRate:     z.number().min(0).max(100),
  discount: z.object({
    type:  z.enum(['percentage', 'fixed']),
    value: z.number().min(0),
  }).optional(),
});

const schema = z.object({
  client:              z.string().min(1, 'Client is required'),
  invoiceNumber:       z.string().optional(),
  invoiceDate:         z.string().optional(),
  dueDate:             z.string().optional(),
  paymentTerms:        z.string().optional(),
  customPaymentDays:   z.number().optional(),
  purchaseOrderNumber: z.string().optional(),
  gstType:             z.enum(['none', 'intrastate', 'interstate']),
  currency:            z.string().default('INR'),
  notes:               z.string().optional(),
  lineItems:           z.array(itemSchema).min(1, 'At least one line item required'),
  invoiceDiscount: z.object({
    type:  z.enum(['percentage', 'fixed']),
    value: z.number().min(0),
  }).optional(),
  // Project / engagement details
  project: z.object({
    name:        z.string().max(200).optional(),
    description: z.string().max(2000).optional(),
    started:     z.boolean().optional(),
    startDate:   z.string().optional(),
    endDate:     z.string().optional(),
  }).optional(),
}).superRefine((data, ctx) => {
  const proj = data.project || {};
  // startDate is required only when "Project Started" is checked
  if (proj.started && !proj.startDate) {
    ctx.addIssue({
      path: ['project', 'startDate'],
      code: z.ZodIssueCode.custom,
      message: 'Start date is required when project is started',
    });
  }
  // End date must come after start date (only when both are provided)
  if (proj.startDate && proj.endDate && new Date(proj.startDate) > new Date(proj.endDate)) {
    ctx.addIssue({
      path: ['project', 'endDate'],
      code: z.ZodIssueCode.custom,
      message: 'End date must be after start date',
    });
  }
});

// Map payment terms string → number of days (mirrors backend calculateDueDate)
const PAYMENT_TERMS_DAYS = {
  'Net 15': 15,
  'Net 30': 30,
  'Net 45': 45,
  'Net 60': 60,
  'Due on Receipt': 0,
};

const toDisplayDate = (d) => {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '';
  return [
    String(dt.getDate()).padStart(2, '0'),
    String(dt.getMonth() + 1).padStart(2, '0'),
    dt.getFullYear(),
  ].join('-');
};

const parseDisplayDate = (s) => {
  if (!s || !/^\d{2}-\d{2}-\d{4}$/.test(s)) return '';
  const [dd, mm, yyyy] = s.split('-');
  return `${yyyy}-${mm}-${dd}`;
};

const addDays = (dateStr, days) => {
  const iso = parseDisplayDate(dateStr);
  if (!iso) return '';
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return toDisplayDate(d);
};

const defaultValues = {
  client:              '',
  invoiceDate:         toDisplayDate(new Date()),
  dueDate:             '',
  paymentTerms:        'Net 30',
  customPaymentDays:   0,
  purchaseOrderNumber: '',
  gstType:             'intrastate',
  currency:            'INR',
  notes:               '',
  lineItems: [
    { description: '', quantity: 1, unitPrice: 0, taxRate: 18, discount: { type: 'percentage', value: 0 } },
  ],
  project: { name: '', description: '', started: false, startDate: '', endDate: '' },
};

export default function CreateInvoice() {
  const navigate  = useNavigate();
  const qc        = useQueryClient();

  // ── Custom Fields ──────────────────────────────────────────────────────────
  const [customFields, setCustomFields] = useState({});
  const handleCustomFieldChange = (key, value) =>
    setCustomFields((prev) => ({ ...prev, [key]: value }));

  // ── Project section toggle ─────────────────────────────────────────────────
  const [showProject, setShowProject] = useState(false);

  // ── Clients ────────────────────────────────────────────────────────────────
  const { data: clientsData } = useQuery({
    queryKey: ['clients', { limit: 100 }],
    queryFn:  () => getClients({ limit: 100 }),
  });
  const clients = clientsData?.data?.data?.clients || [];

  const {
    register, handleSubmit, control, setValue,
    formState: { errors },
  } = useForm({ resolver: zodResolver(schema), defaultValues });

  // Watch client + invoiceDate to auto-fill dueDate from client's payment terms
  const [watchedClient, watchedInvoiceDate] = useWatch({ control, name: ['client', 'invoiceDate'] });

  // ── Next invoice number — re-fetches whenever the selected client changes ────
  const { data: nextNumberData } = useQuery({
    queryKey: ['invoices', 'next-number', watchedClient],
    queryFn:  () => getNextInvoiceNumber(watchedClient || null),
    staleTime: 0,
  });
  const nextInvoiceNumber = nextNumberData?.data?.data?.nextNumber || '';

  // Pre-fill / update the invoice number field whenever the suggestion changes
  useEffect(() => {
    if (nextInvoiceNumber) setValue('invoiceNumber', nextInvoiceNumber, { shouldDirty: false });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextInvoiceNumber]);

  const { data: selectedClientData } = useQuery({
    queryKey: ['client', watchedClient],
    queryFn:  () => getClient(watchedClient),
    enabled:  !!watchedClient,
    staleTime: 60_000,
  });

  // Auto-fill dueDate + paymentTerms when client or invoiceDate changes
  useEffect(() => {
    if (!watchedClient || !watchedInvoiceDate) return;
    const client = selectedClientData?.data?.data?.client;
    const paymentTerms = client?.paymentTerms || 'Net 30';
    const customDays   = client?.customPaymentDays ?? 30;
    const days = paymentTerms === 'Custom'
      ? customDays
      : (PAYMENT_TERMS_DAYS[paymentTerms] ?? 30);
    setValue('dueDate',          addDays(watchedInvoiceDate, days), { shouldDirty: false });
    setValue('paymentTerms',     paymentTerms,                      { shouldDirty: false });
    setValue('customPaymentDays', paymentTerms === 'Custom' ? customDays : 0, { shouldDirty: false });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedClient, watchedInvoiceDate, selectedClientData]);

  // Live calculation
  const watched = useWatch({ control, name: ['lineItems', 'gstType', 'invoiceDiscount', 'currency'] });
  const [lineItems, gstType, invoiceDiscount, currency] = watched;
  const isINR   = currency === 'INR';
  const totals  = calcInvoiceTotals(lineItems, gstType, invoiceDiscount, currency);

  // When currency changes away from INR, gstType is irrelevant — force 'none' so the
  // backend never generates CGST/SGST labels for non-INR invoices.
  useEffect(() => {
    if (currency && currency !== 'INR') {
      setValue('gstType', 'none', { shouldDirty: false });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currency]);

  // Project "started" toggle drives date field visibility
  const projectStarted = useWatch({ control, name: 'project.started', defaultValue: false });

  const { mutate, isPending } = useMutation({
    mutationFn: createInvoice,
    onSuccess: (res) => {
      toast.success('Invoice created!');
      qc.invalidateQueries({ queryKey: ['invoices'] });
      qc.invalidateQueries({ queryKey: ['invoices', 'next-number'] });
      navigate(`/invoices/${res.data.data.invoice._id}`);
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to create invoice'),
  });

  const onSubmit = (formData) => {
    const proj = formData.project || {};
    const cleanedProject = {
      ...proj,
      startDate: proj.startDate || null,
      endDate:   proj.endDate   || null,
      name:      proj.name      || null,
      description: proj.description || null,
    };
    mutate({
      ...formData,
      invoiceDate: parseDisplayDate(formData.invoiceDate) || null,
      dueDate:     parseDisplayDate(formData.dueDate)     || null,
      project: cleanedProject,
      customFields,
    });
  };

  return (
    <div>
      <PageHeader
        title="New Invoice"
        actions={
          <button className="btn btn-secondary" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
        }
      />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">

        {/* ── Header card ── */}
        <div className="card">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

            {/* Invoice number — pre-filled from counter, fully editable */}
            <div>
              <label className="label">
                Invoice Number
                <span className="ml-2 text-xs font-normal text-slate-400">auto-generated · editable</span>
              </label>
              <input
                {...register('invoiceNumber')}
                className="input font-mono"
                placeholder={nextInvoiceNumber || 'Loading…'}
              />
              {errors.invoiceNumber && (
                <p className="text-red-500 text-xs mt-1">{errors.invoiceNumber.message}</p>
              )}
            </div>

            <div>
              <label className="label">Client *</label>
              <select {...register('client')} className="input">
                <option value="">Select client…</option>
                {clients.map((c) => (
                  <option key={c._id} value={c._id}>{c.clientName}</option>
                ))}
              </select>
              {errors.client && <p className="text-red-500 text-xs mt-1">{errors.client.message}</p>}
            </div>

            <div>
              <label className="label">Date</label>
              <input
                {...register('invoiceDate')}
                type="text"
                placeholder="DD-MM-YYYY"
                maxLength={10}
                className="input font-mono"
              />
            </div>

            <div>
              <label className="label">
                Due Date
                {watchedClient && selectedClientData?.data?.data?.client?.paymentTerms && (() => {
                  const c = selectedClientData.data.data.client;
                  const label = c.paymentTerms === 'Custom'
                    ? `Custom (${c.customPaymentDays ?? 30} days)`
                    : c.paymentTerms;
                  return <span className="ml-2 text-xs font-normal text-slate-400">(auto: {label})</span>;
                })()}
              </label>
              <input
                {...register('dueDate')}
                type="text"
                placeholder="DD-MM-YYYY"
                maxLength={10}
                className="input font-mono"
              />
              <p className="text-xs text-slate-400 mt-1">Based on client payment terms — you can override this.</p>
            </div>

            <div>
              <label className="label">PO / Purchase Order Ref</label>
              <input
                {...register('purchaseOrderNumber')}
                className="input"
                placeholder="PO-12345"
              />
            </div>

            {isINR && (
              <div>
                <label className="label">GST Type</label>
                <select {...register('gstType')} className="input">
                  <option value="none">No GST</option>
                  <option value="intrastate">Intrastate (CGST + SGST)</option>
                  <option value="interstate">Interstate (IGST)</option>
                </select>
              </div>
            )}

            <div>
              <label className="label">Currency</label>
              <select {...register('currency')} className="input">
                <option value="INR">INR</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
                <option value="AUD">AUD</option>
                <option value="SGD">SGD</option>
                <option value="AED">AED</option>
              </select>
            </div>
          </div>
        </div>

        {/* ── Line Items ── */}
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Line Items</h2>
          <LineItemEditor
            control={control}
            register={register}
            errors={errors}
            currency={currency}
            isINR={isINR}
          />
          {errors.lineItems && (
            <p className="text-red-500 text-xs mt-2">{errors.lineItems.message}</p>
          )}

          {/* Invoice-level discount */}
          <div className="mt-4 flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3">
            <span className="text-sm text-gray-600 font-medium">Invoice Discount:</span>
            <select {...register('invoiceDiscount.type')} className="input w-full sm:w-36">
              <option value="percentage">Percentage (%)</option>
              <option value="fixed">Fixed</option>
            </select>
            <input
              {...register('invoiceDiscount.value', { valueAsNumber: true })}
              type="number"
              min="0"
              step="0.01"
              className="input w-full sm:w-28"
              placeholder="0"
            />
          </div>

          {/* Totals */}
          <div className="mt-6 flex justify-end">
            <InvoiceTotals totals={totals} currency={currency} />
          </div>
        </div>

        {/* ── Project Details ── */}
        <div className="card">
          <button
            type="button"
            className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-1 w-full text-left"
            onClick={() => setShowProject((v) => !v)}
          >
            <span>{showProject ? '▾' : '▸'}</span>
            Project / Engagement Details
            <span className="ml-2 text-xs font-normal text-gray-400">(optional)</span>
          </button>

          {showProject && (
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="label">Project Name</label>
                <input
                  {...register('project.name')}
                  className="input"
                  placeholder="e.g. Website Redesign Q1 2026"
                />
              </div>

              <div className="md:col-span-2">
                <label className="label">Description</label>
                <textarea
                  {...register('project.description')}
                  className="input"
                  rows={3}
                  placeholder="Brief description of the project or engagement…"
                />
              </div>

              <div className="flex items-center gap-3">
                <input
                  {...register('project.started')}
                  type="checkbox"
                  id="projectStarted"
                  className="w-4 h-4 rounded border-gray-300 text-blue-600"
                />
                <label htmlFor="projectStarted" className="label mb-0 cursor-pointer">
                  Project Started
                </label>
              </div>

              {projectStarted && (
                <>
                  <div>
                    <label className="label">Start Date <span className="text-rose-500">*</span></label>
                    <input {...register('project.startDate')} type="date" className="input" />
                    {errors.project?.startDate && (
                      <p className="text-rose-500 text-xs mt-1">{errors.project.startDate.message}</p>
                    )}
                  </div>
                  <div>
                    <label className="label">End Date</label>
                    <input {...register('project.endDate')} type="date" className="input" />
                    {errors.project?.endDate && (
                      <p className="text-red-500 text-xs mt-1">{errors.project.endDate.message}</p>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* ── Notes ── */}
        <div className="card">
          <label className="label">Notes</label>
          <textarea
            {...register('notes')}
            className="input"
            rows={3}
            placeholder="Payment terms, bank details…"
          />
        </div>

        {/* ── Actions ── */}
        <div className="flex justify-end gap-3">
          <button type="button" className="btn btn-secondary" onClick={() => navigate(-1)}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={isPending}>
            {isPending ? <Spinner /> : 'Create Invoice'}
          </button>
        </div>
      </form>
    </div>
  );
}
