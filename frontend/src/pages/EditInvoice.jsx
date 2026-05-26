import { useState, useRef, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm, useWatch, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ArrowLeft, Pencil, CheckCircle, Tag } from 'lucide-react';
import { getInvoice, updateInvoice, markInvoiceSent } from '../api/invoices.api';
import { getClients, getClient } from '../api/clients.api';
import EditClientModal from '../components/client/EditClientModal';
import { useAuthStore } from '../store/authStore';
import LineItemEditor from '../components/invoice/LineItemEditor';
import InvoiceTotals from '../components/invoice/InvoiceTotals';
import PageHeader from '../components/ui/PageHeader';
import Spinner from '../components/ui/Spinner';
import { calcInvoiceTotals } from '../utils/calculations';
import { useCustomFields } from '../hooks/useCustomFields';
import { CustomFieldsSection } from '../components/customFields/DynamicFieldRenderer';

// ─── Zod schemas ────────────────────────────────────────────────────────────
const itemSchema = z.object({
  description: z.string().min(1, 'Required'),
  quantity:    z.number().min(0),           // user may enter any non-negative value
  unitPrice:   z.number().min(0),
  taxRate:     z.number().min(0).max(100),
  fromDate:    z.string().optional().nullable(),
  toDate:      z.string().optional().nullable(),
  discount: z.object({
    type:  z.enum(['percentage', 'fixed']),
    value: z.number().min(0),
  }).optional(),
});

const schema = z.object({
  client:              z.string().min(1, 'Client is required'),
  invoiceDate:         z.string().optional(),
  dueDate:             z.string().optional(),
  paymentTerms:        z.string().optional(),
  customPaymentDays:   z.number().optional(),
  purchaseOrderNumber: z.string().optional(),
  poDate:              z.string().optional(),
  gstType:             z.enum(['none', 'intrastate', 'interstate']),
  currency:            z.string().default('INR'),
  notes:               z.string().optional(),
  globalUnitPrice:     z.number().min(0).default(0),
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
  if (proj.started && !proj.startDate) {
    ctx.addIssue({ path: ['project', 'startDate'], code: z.ZodIssueCode.custom, message: 'Start date is required when project is started' });
  }
  if (proj.startDate && proj.endDate && new Date(proj.startDate) > new Date(proj.endDate)) {
    ctx.addIssue({ path: ['project', 'endDate'], code: z.ZodIssueCode.custom, message: 'End date must be after start date' });
  }
});

// ─── Helpers ────────────────────────────────────────────────────────────────
const PAYMENT_TERMS_DAYS = { 'Net 15': 15, 'Net 30': 30, 'Net 45': 45, 'Net 60': 60, 'Due on Receipt': 0 };

const toDisplayDate = (d) => {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '';
  return [String(dt.getDate()).padStart(2, '0'), String(dt.getMonth() + 1).padStart(2, '0'), dt.getFullYear()].join('-');
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
  const activeId = useAuthStore((s) => s.selectedCompanyId);

  // ── Custom Fields ──────────────────────────────────────────────────────────
  const { fieldsBySection, evaluateVisibility, buildInitialValues, loading: cfLoading } =
    useCustomFields('invoice');
  const [customFields, setCustomFields]           = useState({});
  const [customFieldErrors, setCustomFieldErrors] = useState({});
  const cfInitialized = useRef(false);
  const visibility    = evaluateVisibility(customFields);
  const handleCustomFieldChange = (key, value) =>
    setCustomFields((prev) => ({ ...prev, [key]: value }));

  const [editClientOpen, setEditClientOpen] = useState(false);
  const [showProject, setShowProject]       = useState(false);

  const { data: invoiceData, isLoading: invoiceLoading } = useQuery({
    queryKey: ['invoice', id],
    queryFn:  () => getInvoice(id),
  });
  const inv = invoiceData?.data?.data?.invoice;

  const { data: clientsData } = useQuery({
    queryKey: ['clients', activeId, { limit: 100 }],
    queryFn:  () => getClients({ limit: 100 }),
  });
  const clients = clientsData?.data?.data?.clients || [];

  const methods = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      client: '', invoiceDate: '', dueDate: '', purchaseOrderNumber: '', poDate: '',
      paymentTerms: 'Net 30', customPaymentDays: 0,
      gstType: 'intrastate', currency: 'INR', notes: '',
      globalUnitPrice: 0,
      lineItems: [{ description: '', quantity: 1, unitPrice: 0, taxRate: 18, fromDate: '', toDate: '', discount: { type: 'percentage', value: 0 } }],
      project: { name: '', description: '', started: false, startDate: '', endDate: '' },
    },
  });
  const { register, handleSubmit, control, reset, setValue, formState: { errors } } = methods;

  // ── Populate form from invoice ─────────────────────────────────────────────
  useEffect(() => {
    if (!inv) return;
    const hasProject = inv.project && (inv.project.name || inv.project.description || inv.project.started);
    if (hasProject) setShowProject(true);

    reset({
      client:              inv.client?._id || inv.client || '',
      invoiceDate:         inv.invoiceDate ? toDisplayDate(new Date(inv.invoiceDate)) : '',
      dueDate:             inv.dueDate     ? toDisplayDate(new Date(inv.dueDate))     : '',
      purchaseOrderNumber: inv.purchaseOrderNumber || '',
      poDate:              inv.poDate ? new Date(inv.poDate).toISOString().slice(0, 10) : '',
      gstType:             inv.gstType || 'intrastate',
      currency:            inv.currency || 'INR',
      notes:               inv.notes || '',
      paymentTerms:        inv.paymentTerms || 'Net 30',
      customPaymentDays:   inv.customPaymentDays || 0,
      // Reset to 0 so the LineItemEditor effect does NOT overwrite per-item prices.
      // Each item loads with its own stored unitPrice below.
      globalUnitPrice:     0,
      lineItems: inv.lineItems?.map((item) => ({
        description: item.description || '',
        quantity:    item.quantity    || 1,
        unitPrice:   item.unitPrice   || 0,
        taxRate:     item.taxRate     || 0,
        fromDate:    item.fromDate    ? new Date(item.fromDate).toISOString().slice(0, 10) : '',
        toDate:      item.toDate      ? new Date(item.toDate).toISOString().slice(0, 10)   : '',
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

  // ── Custom fields init ─────────────────────────────────────────────────────
  useEffect(() => {
    if (inv && !cfLoading && !cfInitialized.current) {
      cfInitialized.current = true;
      setCustomFields(buildInitialValues(inv.customFields || {}));
    }
  }, [inv, cfLoading, buildInitialValues]);

  // ── Auto due-date from client payment terms ───────────────────────────────
  const [watchedClient, watchedInvoiceDate, watchedPaymentTerms] = useWatch({
    control, name: ['client', 'invoiceDate', 'paymentTerms'],
  });
  const formResetDone = useRef(false);
  useEffect(() => { if (inv) formResetDone.current = true; }, [inv]);

  const { data: selectedClientData } = useQuery({
    queryKey: ['client', activeId, watchedClient],
    queryFn:  () => getClient(watchedClient),
    enabled:  !!watchedClient,
    staleTime: 60_000,
  });

  // Auto-fill payment terms + due date when client changes
  useEffect(() => {
    if (!formResetDone.current) return;
    if (!watchedClient || !watchedInvoiceDate) return;
    const client = selectedClientData?.data?.data?.client;
    if (!client) return;
    const paymentTerms = client?.paymentTerms || 'Net 30';
    const customDays   = client?.customPaymentDays ?? 30;
    const days = paymentTerms === 'Custom' ? customDays : (PAYMENT_TERMS_DAYS[paymentTerms] ?? 30);
    setValue('dueDate',           addDays(watchedInvoiceDate, days), { shouldDirty: false });
    setValue('paymentTerms',      paymentTerms,                      { shouldDirty: false });
    setValue('customPaymentDays', paymentTerms === 'Custom' ? customDays : 0, { shouldDirty: false });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedClient, watchedInvoiceDate, selectedClientData]);

  // Recalculate dueDate when user manually changes payment terms dropdown
  useEffect(() => {
    if (!formResetDone.current || !watchedInvoiceDate) return;
    const days = watchedPaymentTerms === 'Due on Receipt' ? 0
      : (PAYMENT_TERMS_DAYS[watchedPaymentTerms] ?? 30);
    setValue('dueDate', addDays(watchedInvoiceDate, days), { shouldDirty: false });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedPaymentTerms]);

  // ── Live Totals ────────────────────────────────────────────────────────────
  const [lineItems, gstType, invoiceDiscount, currency, globalUnitPrice] = useWatch({
    control, name: ['lineItems', 'gstType', 'invoiceDiscount', 'currency', 'globalUnitPrice'],
  });
  const isINR  = currency === 'INR';
  // Pass null so calcInvoiceTotals uses each item's own unitPrice (supports per-item prices)
  const totals = calcInvoiceTotals(lineItems, gstType, invoiceDiscount, currency, null);

  // When currency → non-INR: force gstType 'none'
  useEffect(() => {
    if (currency && currency !== 'INR') {
      setValue('gstType', 'none', { shouldDirty: false });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currency]);

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

  const { mutate: doMarkSent, isPending: markingAsSent } = useMutation({
    mutationFn: () => markInvoiceSent(id),
    onSuccess: () => {
      toast.success('Invoice marked as sent — reminders activated!');
      qc.invalidateQueries({ queryKey: ['invoice', id] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to mark as sent'),
  });

  const onSubmit = (formData) => {
    const gup  = parseFloat(formData.globalUnitPrice) || 0;
    const proj = formData.project || {};

    const lineItemsClean = formData.lineItems.map((item) => ({
      ...item,
      unitPrice: parseFloat(item.unitPrice) || gup,   // per-item price, fallback to global
      taxRate:   formData.currency !== 'INR' ? 0 : (item.taxRate || 0),
      discount:  { type: 'percentage', value: 0 },
      fromDate:  item.fromDate || null,
      toDate:    item.toDate   || null,
    }));

    mutate({
      ...formData,
      globalUnitPrice: gup,
      lineItems:       lineItemsClean,
      invoiceDate:     parseDisplayDate(formData.invoiceDate) || null,
      dueDate:         parseDisplayDate(formData.dueDate)     || null,
      project: {
        ...proj,
        startDate:   proj.startDate   || null,
        endDate:     proj.endDate     || null,
        name:        proj.name        || null,
        description: proj.description || null,
      },
      customFields,
    });
  };

  if (invoiceLoading) return <div className="flex justify-center py-16"><Spinner /></div>;
  if (!inv)           return <div className="text-center py-16 text-gray-400">Invoice not found</div>;

  return (
    <FormProvider {...methods}>
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

              {/* Client */}
              <div>
                <label className="label">Client *</label>
                <div className="flex items-center gap-2">
                  <select {...register('client')} className="input flex-1">
                    <option value="">Select client…</option>
                    {clients.map((c) => (
                      <option key={c._id} value={c._id}>{c.clientName}</option>
                    ))}
                  </select>
                  {watchedClient && (
                    <button
                      type="button"
                      onClick={() => setEditClientOpen(true)}
                      className="flex-shrink-0 flex items-center gap-1.5 px-3 h-9 text-xs font-semibold rounded-lg border border-dashed border-amber-300 text-amber-600 hover:bg-amber-50 transition-colors whitespace-nowrap"
                    >
                      <Pencil className="w-3.5 h-3.5" /> <span>Edit</span>
                    </button>
                  )}
                </div>
                {errors.client && <p className="text-red-500 text-xs mt-1">{errors.client.message}</p>}
              </div>

              {/* Invoice date */}
              <div>
                <label className="label">Date</label>
                <input {...register('invoiceDate')} type="text" placeholder="DD-MM-YYYY" maxLength={10} className="input font-mono" />
              </div>

              {/* Due date */}
              <div>
                <label className="label">
                  Due Date
                  <span className="ml-2 text-xs font-normal text-slate-400">auto from terms · editable</span>
                </label>
                <input {...register('dueDate')} type="text" placeholder="DD-MM-YYYY" maxLength={10} className="input font-mono" />
              </div>

              {/* Payment Terms */}
              <div>
                <label className="label">Payment Terms</label>
                <select {...register('paymentTerms')} className="input">
                  <option value="Due on Receipt">Due on Receipt</option>
                  <option value="Net 15">Net 15</option>
                  <option value="Net 30">Net 30</option>
                  <option value="Net 45">Net 45</option>
                  <option value="Net 60">Net 60</option>
                  <option value="Custom">Custom</option>
                </select>
              </div>

              <div>
                <label className="label">PO / Purchase Order Ref</label>
                <input {...register('purchaseOrderNumber')} className="input" placeholder="PO-12345" />
              </div>

              <div>
                <label className="label">PO Date</label>
                <input {...register('poDate')} type="date" className="input" />
              </div>

              {/* Series badge — read-only on edit (number is already fixed) */}
              {inv?.series && (
                <div>
                  <label className="label">Invoice Series</label>
                  <div className="flex items-center gap-2 h-10 px-3 rounded-lg border border-gray-200 bg-gray-50">
                    <Tag className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                    <span className="font-mono text-sm font-semibold text-indigo-700">
                      {typeof inv.series === 'object' ? inv.series.prefix : inv.series}
                    </span>
                    <span className="text-xs text-gray-400">(locked)</span>
                  </div>
                </div>
              )}

              {/* GST type — only INR */}
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

              {/* Currency */}
              <div>
                <label className="label">Currency</label>
                <select {...register('currency')} className="input">
                  <option value="INR">INR — Indian Rupee</option>
                  <option value="USD">USD — US Dollar (tax-free)</option>
                  <option value="EUR">EUR — Euro</option>
                  <option value="GBP">GBP — British Pound</option>
                  <option value="AUD">AUD — Australian Dollar</option>
                  <option value="SGD">SGD — Singapore Dollar</option>
                  <option value="AED">AED — UAE Dirham</option>
                </select>
              </div>
            </div>
          </div>

          {/* ── Line Items ── */}
          <div className="card">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-sm font-semibold text-gray-800">Line Items</h2>
              {!isINR && (
                <span className="text-xs text-amber-600 font-medium bg-amber-50 px-2 py-1 rounded-full border border-amber-200">
                  🔒 Tax-free ({currency})
                </span>
              )}
            </div>

            <LineItemEditor
              control={control}
              register={register}
              errors={errors}
              setValue={setValue}
              currency={currency}
              isINR={isINR}
            />

            {errors.lineItems && (
              <p className="text-red-500 text-xs mt-2">{errors.lineItems.message}</p>
            )}

            {/* Invoice-level discount */}
            <div className="mt-5 pt-4 border-t border-gray-100">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3">
                <span className="text-sm text-gray-600 font-semibold">Invoice Discount:</span>
                <select {...register('invoiceDiscount.type')} className="input w-full sm:w-36">
                  <option value="percentage">Percentage (%)</option>
                  <option value="fixed">Fixed Amount</option>
                </select>
                <input
                  {...register('invoiceDiscount.value', { valueAsNumber: true })}
                  type="number"
                  min="0"
                  step="0.01"
                  className="input w-full sm:w-28"
                  placeholder="0"
                />
                <span className="text-xs text-gray-400">Applied after all line items</span>
              </div>
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
                  <input {...register('project.name')} className="input" placeholder="e.g. Website Redesign Q1 2026" />
                </div>
                <div className="md:col-span-2">
                  <label className="label">Description</label>
                  <textarea {...register('project.description')} className="input" rows={3} placeholder="Brief description of the project or engagement…" />
                </div>
                <div className="flex items-center gap-3">
                  <input {...register('project.started')} type="checkbox" id="projectStarted" className="w-4 h-4 rounded border-gray-300 text-blue-600" />
                  <label htmlFor="projectStarted" className="label mb-0 cursor-pointer">Project Started</label>
                </div>
                {projectStarted && (
                  <>
                    <div>
                      <label className="label">Start Date <span className="text-rose-500">*</span></label>
                      <input {...register('project.startDate')} type="date" className="input" />
                      {errors.project?.startDate && <p className="text-rose-500 text-xs mt-1">{errors.project.startDate.message}</p>}
                    </div>
                    <div>
                      <label className="label">End Date</label>
                      <input {...register('project.endDate')} type="date" className="input" />
                      {errors.project?.endDate && <p className="text-red-500 text-xs mt-1">{errors.project.endDate.message}</p>}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* ── Notes ── */}
          <div className="card">
            <label className="label">Notes</label>
            <textarea {...register('notes')} className="input" rows={3} placeholder="Payment terms, bank details…" />
          </div>

          {/* ── Custom Fields ── */}
          {Object.keys(fieldsBySection || {}).length > 0 && (
            <div className="card">
              <CustomFieldsSection
                fieldsBySection={fieldsBySection}
                values={customFields}
                errors={customFieldErrors}
                onChange={handleCustomFieldChange}
                visibility={visibility}
              />
            </div>
          )}

          {/* ── Actions ── */}
          <div className="flex justify-between items-center">
            {inv.status === 'draft' ? (
              <button
                type="button"
                onClick={() => doMarkSent()}
                disabled={markingAsSent}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-dashed border-green-400 text-green-700 hover:bg-green-50 transition-colors disabled:opacity-50"
              >
                {markingAsSent ? <Spinner /> : <CheckCircle className="w-4 h-4" />}
                Mark as Sent
              </button>
            ) : (
              <span className="text-xs text-gray-400 capitalize">Status: {inv.status}</span>
            )}

            <div className="flex gap-3">
              <button type="button" className="btn btn-secondary" onClick={() => navigate(-1)}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={isPending}>
                {isPending ? <Spinner /> : 'Save Changes'}
              </button>
            </div>
          </div>
        </form>

        <EditClientModal
          clientId={watchedClient}
          open={editClientOpen}
          onClose={() => setEditClientOpen(false)}
          onUpdated={() => qc.invalidateQueries({ queryKey: ['client', activeId, watchedClient] })}
        />
      </div>
    </FormProvider>
  );
}
