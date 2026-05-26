import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm, useWatch, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ArrowLeft, Building2, UserPlus } from 'lucide-react';
import { createInvoice, getNextInvoiceNumber } from '../api/invoices.api';
import { getClients, getClient } from '../api/clients.api';
import LineItemEditor from '../components/invoice/LineItemEditor';
import InvoiceTotals from '../components/invoice/InvoiceTotals';
import SeriesSelector from '../components/invoice/SeriesSelector';
import PageHeader from '../components/ui/PageHeader';
import Spinner from '../components/ui/Spinner';
import { calcInvoiceTotals } from '../utils/calculations';
import SimpleCustomFields from '../components/customFields/SimpleCustomFields';
import { useActiveCompany } from '../hooks/useActiveCompany';
import AddClientModal from '../components/client/AddClientModal';

// ─── Zod schemas ────────────────────────────────────────────────────────────
const itemSchema = z.object({
  description: z.string().min(1, 'Required'),
  quantity:    z.number().min(0),           // user may enter any non-negative value
  unitPrice:   z.number().min(0),          // synced from globalUnitPrice
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
  seriesId:            z.string().optional(),
  invoiceNumber:       z.string().optional(),
  invoiceDate:         z.string().optional(),
  dueDate:             z.string().optional(),
  paymentTerms:        z.string().optional(),
  customPaymentDays:   z.number().optional(),
  purchaseOrderNumber: z.string().optional(),
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
  globalUnitPrice:     0,
  lineItems: [
    { description: '', quantity: 1, unitPrice: 0, taxRate: 18, fromDate: '', toDate: '', discount: { type: 'percentage', value: 0 } },
  ],
  seriesId:        '',
  invoiceDiscount: { type: 'percentage', value: 0 },
  project: { name: '', description: '', started: false, startDate: '', endDate: '' },
};

export default function CreateInvoice() {
  const navigate = useNavigate();
  const qc       = useQueryClient();

  const { companies, activeCompany, activeId, handleSwitch } = useActiveCompany();
  const lastCompanyIdRef = useRef(null);

  const [customFields, setCustomFields] = useState({});
  const handleCustomFieldChange = (key, value) =>
    setCustomFields((prev) => ({ ...prev, [key]: value }));

  const [addClientOpen, setAddClientOpen] = useState(false);
  const handleClientCreated = (newClient) => {
    if (newClient?._id) setValue('client', newClient._id, { shouldDirty: true });
  };

  const [showProject, setShowProject] = useState(false);

  const { data: clientsData } = useQuery({
    queryKey: ['clients', activeId, { limit: 100 }],
    queryFn:  () => getClients({ limit: 100 }),
  });
  const clients = clientsData?.data?.data?.clients || [];

  const methods = useForm({ resolver: zodResolver(schema), defaultValues });
  const { register, handleSubmit, control, setValue, formState: { errors } } = methods;

  const [watchedClient, watchedInvoiceDate, watchedSeriesId] = useWatch({
    control, name: ['client', 'invoiceDate', 'seriesId'],
  });

  const { data: nextNumberData } = useQuery({
    queryKey: ['invoices', 'next-number', activeId, watchedClient, watchedSeriesId],
    queryFn:  () => getNextInvoiceNumber(watchedClient || null, watchedSeriesId || null),
    staleTime: 0,
  });
  const nextInvoiceNumber = nextNumberData?.data?.data?.nextNumber || '';

  useEffect(() => {
    if (nextInvoiceNumber) setValue('invoiceNumber', nextInvoiceNumber, { shouldDirty: false });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextInvoiceNumber]);

  const { data: selectedClientData } = useQuery({
    queryKey: ['client', activeId, watchedClient],
    queryFn:  () => getClient(watchedClient),
    enabled:  !!watchedClient,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!watchedClient || !watchedInvoiceDate) return;
    const client = selectedClientData?.data?.data?.client;
    const paymentTerms = client?.paymentTerms || 'Net 30';
    const customDays   = client?.customPaymentDays ?? 30;
    const days = paymentTerms === 'Custom' ? customDays : (PAYMENT_TERMS_DAYS[paymentTerms] ?? 30);
    setValue('dueDate',           addDays(watchedInvoiceDate, days), { shouldDirty: false });
    setValue('paymentTerms',      paymentTerms,                      { shouldDirty: false });
    setValue('customPaymentDays', paymentTerms === 'Custom' ? customDays : 0, { shouldDirty: false });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedClient, watchedInvoiceDate, selectedClientData]);

  // ── Live calculation ───────────────────────────────────────────────────────
  const [lineItems, gstType, invoiceDiscount, currency, globalUnitPrice] = useWatch({
    control, name: ['lineItems', 'gstType', 'invoiceDiscount', 'currency', 'globalUnitPrice'],
  });
  const isINR  = currency === 'INR';
  const totals = calcInvoiceTotals(lineItems, gstType, invoiceDiscount, currency, parseFloat(globalUnitPrice) || 0);

  // When currency → non-INR: force gstType 'none' and lock taxRates to 0
  useEffect(() => {
    if (currency && currency !== 'INR') {
      setValue('gstType', 'none', { shouldDirty: false });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currency]);

  // Company switch: apply default currency
  useEffect(() => {
    if (!activeId) return;
    const isFirstResolution = lastCompanyIdRef.current === null;
    lastCompanyIdRef.current = activeId;
    const defaultCurrency = activeCompany?.invoiceSettings?.defaultCurrency || 'INR';
    if (isFirstResolution) {
      if (defaultCurrency !== 'INR') setValue('currency', defaultCurrency, { shouldDirty: false });
      return;
    }
    setValue('client',   '',              { shouldDirty: false });
    setValue('seriesId', '',              { shouldDirty: false });
    setValue('currency', defaultCurrency, { shouldDirty: false });
    setValue('gstType',  defaultCurrency !== 'INR' ? 'none' : 'intrastate', { shouldDirty: false });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

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
    const gup = parseFloat(formData.globalUnitPrice) || 0;
    const proj = formData.project || {};

    // Inject globalUnitPrice into every line item's unitPrice and zero tax for non-INR
    const lineItemsClean = formData.lineItems.map((item) => ({
      ...item,
      unitPrice: gup,
      taxRate:   formData.currency !== 'INR' ? 0 : (item.taxRate || 0),
      discount:  { type: 'percentage', value: 0 },
      fromDate:  item.fromDate || null,
      toDate:    item.toDate   || null,
    }));

    mutate({
      ...formData,
      seriesId:        formData.seriesId || null,
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

  return (
    <FormProvider {...methods}>
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

              {companies.length > 1 && (
                <div className="col-span-1 sm:col-span-2 lg:col-span-3">
                  <label className="label">Billing Company</label>
                  <div className="flex flex-wrap items-center gap-3">
                    <select
                      className="input w-full sm:w-auto sm:max-w-xs"
                      value={activeId || ''}
                      onChange={(e) => {
                        const company = companies.find((c) => c._id === e.target.value);
                        if (company) handleSwitch(company);
                      }}
                    >
                      {companies.map((c) => (
                        <option key={c._id} value={c._id}>{c.companyName}</option>
                      ))}
                    </select>
                    {activeCompany && (
                      <div className="flex flex-wrap items-center gap-2">
                        {(activeCompany.shortCode || activeCompany.invoiceSettings?.prefix) && (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-mono font-semibold" style={{ background: '#EEF2FF', color: '#4F46E5' }}>
                            <Building2 className="w-3 h-3" />
                            {activeCompany.shortCode || activeCompany.invoiceSettings?.prefix}
                          </span>
                        )}
                        {activeCompany.gstNumber && (
                          <span className="text-xs text-gray-500 font-mono">GST: {activeCompany.gstNumber}</span>
                        )}
                        {activeCompany.invoiceSettings?.defaultCurrency && activeCompany.invoiceSettings.defaultCurrency !== 'INR' && (
                          <span className="inline-flex items-center px-2 py-1 rounded text-xs font-semibold" style={{ background: '#FEF3C7', color: '#92400E' }}>
                            {activeCompany.invoiceSettings.defaultCurrency}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Series selector */}
              <SeriesSelector
                value={watchedSeriesId || ''}
                onChange={(id) => {
                  setValue('seriesId', id, { shouldDirty: true });
                  // Clear manual invoice number when series changes — let it re-auto-generate
                  setValue('invoiceNumber', '', { shouldDirty: false });
                }}
                onClientLink={(clientId) => {
                  // If the chosen series is locked to a client, auto-fill the client field
                  if (clientId) setValue('client', clientId, { shouldDirty: true });
                }}
              />

              {/* Invoice number */}
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
              </div>

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
                  <button
                    type="button"
                    onClick={() => setAddClientOpen(true)}
                    className="flex-shrink-0 flex items-center gap-1.5 px-3 h-9 text-xs font-semibold rounded-lg border border-dashed border-indigo-300 text-indigo-600 hover:bg-indigo-50 transition-colors whitespace-nowrap"
                  >
                    <UserPlus className="w-3.5 h-3.5" /> <span>New</span>
                  </button>
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
                  {watchedClient && selectedClientData?.data?.data?.client?.paymentTerms && (() => {
                    const c = selectedClientData.data.data.client;
                    const label = c.paymentTerms === 'Custom' ? `Custom (${c.customPaymentDays ?? 30} days)` : c.paymentTerms;
                    return <span className="ml-2 text-xs font-normal text-slate-400">(auto: {label})</span>;
                  })()}
                </label>
                <input {...register('dueDate')} type="text" placeholder="DD-MM-YYYY" maxLength={10} className="input font-mono" />
                <p className="text-xs text-slate-400 mt-1">Based on client payment terms — you can override this.</p>
              </div>

              <div>
                <label className="label">PO / Purchase Order Ref</label>
                <input {...register('purchaseOrderNumber')} className="input" placeholder="PO-12345" />
              </div>

              {/* GST type — only for INR */}
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
          <SimpleCustomFields
            customFields={customFields}
            onChange={handleCustomFieldChange}
          />

          {/* ── Actions ── */}
          <div className="flex justify-end gap-3">
            <button type="button" className="btn btn-secondary" onClick={() => navigate(-1)}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={isPending}>
              {isPending ? <Spinner /> : 'Create Invoice'}
            </button>
          </div>
        </form>

        <AddClientModal
          open={addClientOpen}
          onClose={() => setAddClientOpen(false)}
          onCreated={handleClientCreated}
        />
      </div>
    </FormProvider>
  );
}
