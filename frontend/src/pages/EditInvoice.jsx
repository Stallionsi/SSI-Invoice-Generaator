import { useState, useRef, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ArrowLeft } from 'lucide-react';
import { getInvoice, updateInvoice } from '../api/invoices.api';
import { getClients, getClient } from '../api/clients.api';
import LineItemEditor from '../components/invoice/LineItemEditor';
import InvoiceTotals from '../components/invoice/InvoiceTotals';
import PageHeader from '../components/ui/PageHeader';
import Spinner from '../components/ui/Spinner';
import { calcInvoiceTotals } from '../utils/calculations';
import { useCustomFields } from '../hooks/useCustomFields';
import { CustomFieldsSection } from '../components/customFields/DynamicFieldRenderer';

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
  invoiceDate:         z.string().optional(),
  dueDate:             z.string().optional(),
  purchaseOrderNumber: z.string().optional(),
  gstType:             z.enum(['none', 'intrastate', 'interstate']),
  currency:            z.string().default('INR'),
  notes:               z.string().optional(),
  lineItems:           z.array(itemSchema).min(1, 'At least one line item required'),
  invoiceDiscount: z.object({
    type:  z.enum(['percentage', 'fixed']),
    value: z.number().min(0),
  }).optional(),
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

// Map payment terms string → number of days
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

export default function EditInvoice() {
  const { id }   = useParams();
  const navigate = useNavigate();
  const qc       = useQueryClient();

  // ── Custom Fields ──────────────────────────────────────────────────────────
  const { fieldsBySection, evaluateVisibility, buildInitialValues, loading: cfLoading } =
    useCustomFields('invoice');
  const [customFields, setCustomFields]           = useState({});
  const [customFieldErrors, setCustomFieldErrors] = useState({});
  const cfInitialized = useRef(false);
  const visibility    = evaluateVisibility(customFields);
  const handleCustomFieldChange = (key, value) =>
    setCustomFields((prev) => ({ ...prev, [key]: value }));

  // ── Project section toggle ─────────────────────────────────────────────────
  const [showProject, setShowProject] = useState(false);

  // ── Existing Invoice ───────────────────────────────────────────────────────
  const { data: invoiceData, isLoading: invoiceLoading } = useQuery({
    queryKey: ['invoice', id],
    queryFn:  () => getInvoice(id),
  });
  const inv = invoiceData?.data?.data?.invoice;

  // ── Clients ────────────────────────────────────────────────────────────────
  const { data: clientsData } = useQuery({
    queryKey: ['clients', { limit: 100 }],
    queryFn:  () => getClients({ limit: 100 }),
  });
  const clients = clientsData?.data?.data?.clients || [];

  // ── Form ───────────────────────────────────────────────────────────────────
  const {
    register, handleSubmit, control, reset, setValue,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      client: '', invoiceDate: '', dueDate: '', purchaseOrderNumber: '',
      gstType: 'intrastate', currency: 'INR', notes: '',
      lineItems: [{ description: '', quantity: 1, unitPrice: 0, taxRate: 18, discount: { type: 'percentage', value: 0 } }],
      project: { name: '', description: '', started: false, startDate: '', endDate: '' },
    },
  });

  // Populate form once invoice data arrives
  useEffect(() => {
    if (!inv) return;
    const hasProject = inv.project && (inv.project.name || inv.project.description || inv.project.started);
    if (hasProject) setShowProject(true);

    reset({
      client:              inv.client?._id || inv.client || '',
      invoiceDate:         inv.invoiceDate ? toDisplayDate(new Date(inv.invoiceDate)) : '',
      dueDate:             inv.dueDate     ? toDisplayDate(new Date(inv.dueDate))     : '',
      purchaseOrderNumber: inv.purchaseOrderNumber || '',
      gstType:             inv.gstType || 'intrastate',
      currency:            inv.currency || 'INR',
      notes:               inv.notes || '',
      lineItems: inv.lineItems?.map((item) => ({
        description: item.description || '',
        quantity:    item.quantity    || 1,
        unitPrice:   item.unitPrice   || 0,
        taxRate:     item.taxRate     || 0,
        discount:    item.discount    || { type: 'percentage', value: 0 },
      })) || [],
      invoiceDiscount: inv.invoiceDiscount || { type: 'percentage', value: 0 },
      project: {
        name:        inv.project?.name        || '',
        description: inv.project?.description || '',
        started:     inv.project?.started     || false,
        startDate:   inv.project?.startDate?.slice(0, 10) || '',
        endDate:     inv.project?.endDate?.slice(0, 10)   || '',
      },
    });
  }, [inv, reset]);

  // Populate custom fields once BOTH invoice and field definitions are ready
  useEffect(() => {
    if (inv && !cfLoading && !cfInitialized.current) {
      cfInitialized.current = true;
      setCustomFields(buildInitialValues(inv.customFields || {}));
    }
  }, [inv, cfLoading, buildInitialValues]);

  // ── Auto-fill due date from client payment terms ────────────────────────
  // Watch client + invoiceDate changes made by the user while editing
  const [watchedClient, watchedInvoiceDate] = useWatch({ control, name: ['client', 'invoiceDate'] });

  // Track whether the form has been reset (loaded) so we don't overwrite the original due date on first mount
  const formResetDone = useRef(false);
  useEffect(() => {
    if (inv) formResetDone.current = true;
  }, [inv]);

  const { data: selectedClientData } = useQuery({
    queryKey: ['client', watchedClient],
    queryFn:  () => getClient(watchedClient),
    enabled:  !!watchedClient,
    staleTime: 60_000,
  });

  useEffect(() => {
    // Skip the initial auto-fill on form load — only fire when user actively changes client/date
    if (!formResetDone.current) return;
    if (!watchedClient || !watchedInvoiceDate) return;
    const client = selectedClientData?.data?.data?.client;
    const paymentTerms = client?.paymentTerms || 'Net 30';
    const customDays   = client?.customPaymentDays ?? 30;
    const days = paymentTerms === 'Custom'
      ? customDays
      : (PAYMENT_TERMS_DAYS[paymentTerms] ?? 30);
    setValue('dueDate',           addDays(watchedInvoiceDate, days), { shouldDirty: false });
    setValue('paymentTerms',      paymentTerms,                      { shouldDirty: false });
    setValue('customPaymentDays', paymentTerms === 'Custom' ? customDays : 0, { shouldDirty: false });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedClient, watchedInvoiceDate, selectedClientData]);

  // ── Live Totals ────────────────────────────────────────────────────────────
  const watched = useWatch({ control, name: ['lineItems', 'gstType', 'invoiceDiscount', 'currency'] });
  const [lineItems, gstType, invoiceDiscount, currency] = watched;
  const isINR   = currency === 'INR';
  const totals  = calcInvoiceTotals(lineItems, gstType, invoiceDiscount, currency);

  // When currency changes away from INR, force gstType to 'none' so the backend
  // never generates CGST/SGST labels for non-INR invoices.
  useEffect(() => {
    if (currency && currency !== 'INR') {
      setValue('gstType', 'none', { shouldDirty: false });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currency]);

  // Project started toggle drives date fields
  const projectStarted = useWatch({ control, name: 'project.started', defaultValue: false });

  // ── Submit ─────────────────────────────────────────────────────────────────
  const { mutate, isPending } = useMutation({
    mutationFn: (data) => updateInvoice(id, data),
    onSuccess: () => {
      toast.success('Invoice updated!');
      qc.invalidateQueries({ queryKey: ['invoice', id] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
      navigate(`/invoices/${id}`);
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to update invoice'),
  });

  const onSubmit = (formData) => {
    const proj = formData.project || {};
    const cleanedProject = {
      ...proj,
      startDate:   proj.startDate   || null,
      endDate:     proj.endDate     || null,
      name:        proj.name        || null,
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

  // ── Loading ────────────────────────────────────────────────────────────────
  if (invoiceLoading) {
    return <div className="flex justify-center py-16"><Spinner /></div>;
  }
  if (!inv) {
    return <div className="text-center py-16 text-gray-400">Invoice not found</div>;
  }

  return (
    <div>
      <PageHeader
        title={`Edit ${inv.invoiceNumber}`}
        actions={
          <button className="btn btn-secondary" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
        }
      />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">

        {/* ── Header card ── */}
        <div className="card">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

          <div className="mt-4 flex items-center gap-3 flex-wrap">
            <span className="text-sm text-gray-600 font-medium">Invoice Discount:</span>
            <select {...register('invoiceDiscount.type')} className="input w-36">
              <option value="percentage">Percentage (%)</option>
              <option value="fixed">Fixed</option>
            </select>
            <input
              {...register('invoiceDiscount.value', { valueAsNumber: true })}
              type="number"
              min="0"
              step="0.01"
              className="input w-28"
              placeholder="0"
            />
          </div>

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
            {isPending ? <Spinner /> : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );
}
