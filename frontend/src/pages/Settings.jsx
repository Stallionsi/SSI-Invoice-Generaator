import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Building2, ChevronDown, Plus, X, Check,
  CreditCard, FileText,
} from 'lucide-react';
import {
  getCompany, createCompany, updateCompany, updateInvoiceSettings,
} from '../api/company.api';
import { useActiveCompany } from '../hooks/useActiveCompany';
import PageHeader from '../components/ui/PageHeader';
import Spinner from '../components/ui/Spinner';

// ─── Zod Schemas ───────────────────────────────────────────────────────────────
const bankSchema = z.object({
  bankName:      z.string().optional(),
  accountName:   z.string().optional(),
  accountNumber: z.string().optional(),
  routingNumber: z.string().optional(),
  ifscCode:      z.string().optional(),
  branch:        z.string().optional(),
  swiftCode:     z.string().optional(),
});

const profileSchema = z.object({
  companyName:    z.string().min(1, 'Required'),
  shortCode:      z.string().max(10).optional().or(z.literal('')),
  gstNumber:      z.string().optional().or(z.literal('')),
  panNumber:      z.string().optional().or(z.literal('')),
  cinNumber:      z.string().optional().or(z.literal('')),
  email:          z.string().email().optional().or(z.literal('')),
  phone:          z.string().optional(),
  alternatePhone: z.string().optional(),
  website:        z.string().optional(),
  bankDetails:    z.array(bankSchema).optional(),
  address: z.object({
    line1:   z.string().optional(),
    line2:   z.string().optional(),
    city:    z.string().optional(),
    state:   z.string().optional(),
    pincode: z.string().optional(),
    country: z.string().optional(),
  }).optional(),
});

const invSchema = z.object({
  prefix:              z.string().optional(),
  nextNumber:          z.number().optional(),
  defaultCurrency:     z.string().optional(),
  defaultPaymentTerms: z.string().optional(),
  defaultNotes:        z.string().optional(),
});

const newCompanySchema = z.object({
  companyName: z.string().min(1, 'Company name is required'),
  shortCode:   z.string().max(10).optional().or(z.literal('')),
  gstNumber:   z.string().optional().or(z.literal('')),
});

// ─── WorkspaceSwitcher ─────────────────────────────────────────────────────────
function WorkspaceSwitcher({ onNewCompany }) {
  const { companies, activeCompany, activeId, handleSwitch } = useActiveCompany();
  const [open, setOpen] = useState(false);

  const prefix = activeCompany?.shortCode || activeCompany?.invoiceSettings?.prefix;

  return (
    <div
      className="rounded-2xl p-5 flex items-center justify-between gap-4"
      style={{ background: 'linear-gradient(135deg, #EEF2FF 0%, #F8F9FF 100%)', border: '1px solid #E0E7FF' }}
    >
      {/* Left: active company identity */}
      <div className="flex items-center gap-3 min-w-0">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: 'linear-gradient(135deg, #6366F1, #4F46E5)' }}
        >
          <Building2 className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-indigo-400 mb-0.5">
            Active Workspace
          </p>
          <p className="text-base font-bold text-gray-900 truncate leading-tight">
            {activeCompany?.companyName || 'No company yet'}
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-0.5">
            {prefix && (
              <span className="text-[10px] font-mono font-bold text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded">
                {prefix}
              </span>
            )}
            {activeCompany?.gstNumber && (
              <span className="text-[10px] text-gray-400 font-mono">
                GST: {activeCompany.gstNumber}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Right: switch + create */}
      <div className="flex items-center gap-2 shrink-0">
        {companies.length > 1 && (
          <div className="relative">
            <button
              onClick={() => setOpen((v) => !v)}
              className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-sm font-medium transition-all"
              style={{ background: '#fff', border: '1px solid #C7D2FE', color: '#4F46E5' }}
            >
              Switch
              <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && (
              <>
                {/* Backdrop */}
                <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
                <div
                  className="absolute right-0 top-full mt-2 w-72 rounded-xl z-50 overflow-hidden"
                  style={{ background: '#fff', border: '1px solid #E5E7EB', boxShadow: '0 12px 32px rgba(99,102,241,0.15)' }}
                >
                  <div className="p-2">
                    <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                      Your Companies
                    </p>
                    {companies.map((c) => (
                      <button
                        key={c._id}
                        onClick={() => { handleSwitch(c); setOpen(false); }}
                        className="w-full text-left flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-colors"
                        style={
                          c._id === activeId
                            ? { background: '#EEF2FF', color: '#4F46E5' }
                            : { color: '#374151' }
                        }
                      >
                        <Building2 className="w-3.5 h-3.5 shrink-0 opacity-60" />
                        <div className="flex-1 min-w-0">
                          <p className="truncate font-medium">{c.companyName}</p>
                          {(c.shortCode || c.invoiceSettings?.prefix) && (
                            <p className="text-[10px] text-gray-400 font-mono">
                              {c.shortCode || c.invoiceSettings?.prefix}
                            </p>
                          )}
                        </div>
                        {c._id === activeId && <Check className="w-3.5 h-3.5 shrink-0" />}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        <button
          onClick={onNewCompany}
          className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold transition-all text-white"
          style={{ background: 'linear-gradient(135deg, #6366F1, #4F46E5)' }}
        >
          <Plus className="w-3.5 h-3.5" />
          New Company
        </button>
      </div>
    </div>
  );
}

// ─── NewCompanyModal ───────────────────────────────────────────────────────────
function NewCompanyModal({ onClose }) {
  const qc = useQueryClient();
  const { handleSwitch } = useActiveCompany();

  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(newCompanySchema),
    defaultValues: { companyName: '', shortCode: '', gstNumber: '' },
  });

  const { mutate, isPending } = useMutation({
    mutationFn: createCompany,
    onSuccess: (res) => {
      const created = res.data?.data?.company;
      toast.success(`"${created.companyName}" created`);
      qc.invalidateQueries({ queryKey: ['company-all'] });
      // Switch to the new company — handleSwitch invalidates all queries including ['my-companies']
      if (created) handleSwitch(created);
      onClose();
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to create company'),
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(2px)' }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: '#EEF2FF' }}
            >
              <Building2 className="w-3.5 h-3.5 text-indigo-600" />
            </div>
            <h2 className="text-sm font-semibold text-gray-900">New Company</h2>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit(mutate)} className="p-6 space-y-4">
          <div>
            <label className="label">Company Name *</label>
            <input
              {...register('companyName')}
              className="input"
              placeholder="STALLIONSI LLC"
              autoFocus
            />
            {errors.companyName && (
              <p className="text-red-500 text-xs mt-1">{errors.companyName.message}</p>
            )}
          </div>

          <div>
            <label className="label">
              Short Code
              <span className="ml-1 text-xs font-normal text-gray-400">
                — invoice prefix, e.g. SSI/LLC → SSI/LLC-2026-27-0001
              </span>
            </label>
            <input
              {...register('shortCode')}
              className="input font-mono"
              placeholder="SSI/LLC"
              maxLength={10}
              style={{ textTransform: 'uppercase' }}
            />
          </div>

          <div>
            <label className="label">
              GST Number
              <span className="ml-1 text-xs font-normal text-gray-400">(optional)</span>
            </label>
            <input
              {...register('gstNumber')}
              className="input font-mono"
              placeholder="27AAPFU0939F1ZV"
              style={{ textTransform: 'uppercase' }}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn btn-secondary text-sm">
              Cancel
            </button>
            <button type="submit" className="btn-primary text-sm" disabled={isPending}>
              {isPending ? <Spinner /> : 'Create Company'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Settings Page ────────────────────────────────────────────────────────
export default function Settings() {
  const qc = useQueryClient();
  const { activeId, handleSwitch } = useActiveCompany();
  const [showNewCompany, setShowNewCompany] = useState(false);

  // Fetch active company's full profile. Keyed by activeId so switching
  // companies immediately loads that company's data from cache (or fetches it).
  const { data, isLoading } = useQuery({
    queryKey: ['company', activeId],
    queryFn:  getCompany,
    staleTime: 5 * 60 * 1000,
  });

  const company = data?.data?.data?.company;

  // ── Company Profile form ─────────────────────────────────────────────────
  // `values` causes react-hook-form to reset the form whenever the company data
  // changes — this is what makes switching companies update all fields instantly.
  const profileForm = useForm({
    resolver: zodResolver(profileSchema),
    values: company ? {
      companyName:    company.companyName    || '',
      shortCode:      company.shortCode      || '',
      gstNumber:      company.gstNumber      || '',
      panNumber:      company.panNumber      || '',
      cinNumber:      company.cinNumber      || '',
      email:          company.email          || '',
      phone:          company.phone          || '',
      alternatePhone: company.alternatePhone || '',
      website:        company.website        || '',
      bankDetails:    company.bankDetails?.length ? company.bankDetails : [{}],
      address:        company.address        || {},
    } : undefined,
  });

  // ── Invoice Settings form ────────────────────────────────────────────────
  const invForm = useForm({
    resolver: zodResolver(invSchema),
    values: company?.invoiceSettings ? {
      prefix:              company.invoiceSettings.prefix              || 'INV',
      nextNumber:          company.invoiceSettings.nextNumber          ?? 1,
      defaultCurrency:     company.invoiceSettings.defaultCurrency     || 'INR',
      defaultPaymentTerms: company.invoiceSettings.defaultPaymentTerms || 'Net 30',
      defaultNotes:        company.invoiceSettings.defaultNotes        || '',
    } : undefined,
  });

  // After any save, refresh this company's data AND the Navbar companies list
  // (in case companyName / shortCode changed).
  const invalidateCompany = () => {
    qc.invalidateQueries({ queryKey: ['company', activeId] });
    qc.invalidateQueries({ queryKey: ['my-companies'] });
  };

  const { mutate: saveProfile, isPending: savingProfile } = useMutation({
    mutationFn: (d) => (company ? updateCompany(d) : createCompany(d)),
    onSuccess: (res) => {
      toast.success('Company profile saved');
      invalidateCompany();
      // If this was a first-time create, switch to the new company
      if (!company) {
        const created = res.data?.data?.company;
        if (created) handleSwitch(created);
        qc.invalidateQueries({ queryKey: ['company-all'] });
      }
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to save'),
  });

  const { mutate: saveInv, isPending: savingInv } = useMutation({
    mutationFn: updateInvoiceSettings,
    onSuccess: () => { toast.success('Invoice settings saved'); invalidateCompany(); },
    onError:   (e) => toast.error(e.response?.data?.message || 'Failed to save'),
  });

  return (
    <div>
      {showNewCompany && <NewCompanyModal onClose={() => setShowNewCompany(false)} />}

      <PageHeader
        title="Settings"
        subtitle="Manage your workspace, companies, and invoice configuration."
      />

      <div className="space-y-6 max-w-2xl">

        {/* ── Workspace switcher ── */}
        <WorkspaceSwitcher onNewCompany={() => setShowNewCompany(true)} />

        {isLoading && !company ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : (
          <>
            {/* ── Company Profile ── */}
            <div className="card">
              <div className="flex items-center gap-2 mb-5">
                <Building2 className="w-4 h-4 text-primary-500" />
                <h2 className="text-base font-semibold text-gray-800">Company Profile</h2>
              </div>

              <form onSubmit={profileForm.handleSubmit(saveProfile)} className="space-y-5">

                {/* Identity */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="label">Company Name *</label>
                    <input {...profileForm.register('companyName')} className="input" placeholder="STALLIONSI LLC" />
                    {profileForm.formState.errors.companyName && (
                      <p className="text-red-500 text-xs mt-1">Required</p>
                    )}
                  </div>
                  <div>
                    <label className="label">
                      Short Code
                      <span className="ml-1 text-[10px] font-normal text-gray-400">invoice prefix · max 10 chars</span>
                    </label>
                    <input
                      {...profileForm.register('shortCode')}
                      className="input font-mono"
                      placeholder="SSI/LLC"
                      maxLength={10}
                      style={{ textTransform: 'uppercase' }}
                    />
                  </div>
                  <div>
                    <label className="label">GST Number</label>
                    <input {...profileForm.register('gstNumber')} className="input font-mono" placeholder="27AAPFU0939F1ZV" />
                  </div>
                  <div>
                    <label className="label">PAN Number</label>
                    <input {...profileForm.register('panNumber')} className="input font-mono" placeholder="AAPFU0939F" />
                  </div>
                  <div>
                    <label className="label">CIN Number</label>
                    <input {...profileForm.register('cinNumber')} className="input font-mono" placeholder="U74999MH2021PTC123456" />
                  </div>
                  <div>
                    <label className="label">Email</label>
                    <input {...profileForm.register('email')} type="email" className="input" placeholder="billing@company.com" />
                  </div>
                  <div>
                    <label className="label">Phone</label>
                    <input {...profileForm.register('phone')} className="input" placeholder="+91 98765 43210" />
                  </div>
                  <div>
                    <label className="label">Alternate Phone</label>
                    <input {...profileForm.register('alternatePhone')} className="input" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="label">Website</label>
                    <input {...profileForm.register('website')} className="input" placeholder="https://yourcompany.com" />
                  </div>
                </div>

                {/* Address */}
                <div>
                  <p className="text-sm font-semibold text-gray-700 mb-2">Address</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="md:col-span-2">
                      <input {...profileForm.register('address.line1')} className="input" placeholder="Address Line 1" />
                    </div>
                    <div className="md:col-span-2">
                      <input {...profileForm.register('address.line2')} className="input" placeholder="Address Line 2" />
                    </div>
                    <input {...profileForm.register('address.city')}    className="input" placeholder="City" />
                    <input {...profileForm.register('address.state')}   className="input" placeholder="State" />
                    <input {...profileForm.register('address.pincode')} className="input" placeholder="PIN / ZIP" />
                    <input {...profileForm.register('address.country')} className="input" placeholder="Country" />
                  </div>
                </div>

                {/* Bank Details */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <CreditCard className="w-3.5 h-3.5 text-gray-400" />
                    <p className="text-sm font-semibold text-gray-700">Bank Details</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="label">Bank Name</label>
                      <input {...profileForm.register('bankDetails.0.bankName')} className="input" placeholder="HDFC Bank" />
                    </div>
                    <div>
                      <label className="label">Account Name</label>
                      <input {...profileForm.register('bankDetails.0.accountName')} className="input" placeholder="STALLIONSI LLC" />
                    </div>
                    <div>
                      <label className="label">Account Number</label>
                      <input {...profileForm.register('bankDetails.0.accountNumber')} className="input font-mono" placeholder="50100123456789" />
                    </div>
                    <div>
                      <label className="label">IFSC Code <span className="text-gray-400 font-normal">(India)</span></label>
                      <input {...profileForm.register('bankDetails.0.ifscCode')} className="input font-mono" placeholder="HDFC0001234" />
                    </div>
                    <div>
                      <label className="label">Routing Number <span className="text-gray-400 font-normal">(US)</span></label>
                      <input {...profileForm.register('bankDetails.0.routingNumber')} className="input font-mono" placeholder="121000358" />
                    </div>
                    <div>
                      <label className="label">SWIFT Code <span className="text-gray-400 font-normal">(International)</span></label>
                      <input {...profileForm.register('bankDetails.0.swiftCode')} className="input font-mono" placeholder="HDFCINBB" />
                    </div>
                    <div className="md:col-span-2">
                      <label className="label">Branch</label>
                      <input {...profileForm.register('bankDetails.0.branch')} className="input" placeholder="Andheri West, Mumbai" />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-1">
                  <button type="submit" className="btn-primary" disabled={savingProfile}>
                    {savingProfile ? <Spinner /> : (company ? 'Save Profile' : 'Create Company')}
                  </button>
                </div>
              </form>
            </div>

            {/* ── Invoice Settings ── */}
            <div className="card">
              <div className="flex items-center gap-2 mb-5">
                <FileText className="w-4 h-4 text-primary-500" />
                <h2 className="text-base font-semibold text-gray-800">Invoice Settings</h2>
              </div>

              <form onSubmit={invForm.handleSubmit(saveInv)} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="label">
                      Invoice Prefix
                      <span className="ml-1 text-[10px] font-normal text-gray-400">legacy — prefer Short Code above</span>
                    </label>
                    <input {...invForm.register('prefix')} className="input font-mono" placeholder="INV" />
                  </div>
                  <div>
                    <label className="label">Next Invoice Number</label>
                    <input
                      {...invForm.register('nextNumber', { valueAsNumber: true })}
                      type="number"
                      min="1"
                      className="input font-mono"
                    />
                  </div>
                  <div>
                    <label className="label">Default Currency</label>
                    <select {...invForm.register('defaultCurrency')} className="input">
                      <option value="INR">INR — Indian Rupee</option>
                      <option value="USD">USD — US Dollar</option>
                      <option value="EUR">EUR — Euro</option>
                      <option value="GBP">GBP — British Pound</option>
                      <option value="AUD">AUD — Australian Dollar</option>
                      <option value="SGD">SGD — Singapore Dollar</option>
                      <option value="AED">AED — UAE Dirham</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">Default Payment Terms</label>
                    <select {...invForm.register('defaultPaymentTerms')} className="input">
                      <option value="Net 15">Net 15</option>
                      <option value="Net 30">Net 30</option>
                      <option value="Net 45">Net 45</option>
                      <option value="Net 60">Net 60</option>
                      <option value="Due on Receipt">Due on Receipt</option>
                      <option value="Custom">Custom</option>
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className="label">Default Invoice Notes</label>
                    <textarea
                      {...invForm.register('defaultNotes')}
                      className="input"
                      rows={3}
                      placeholder="e.g. Payment within 30 days. Bank transfer preferred."
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <button type="submit" className="btn-primary" disabled={savingInv}>
                    {savingInv ? <Spinner /> : 'Save Invoice Settings'}
                  </button>
                </div>
              </form>
            </div>
          </>
        )}

      </div>
    </div>
  );
}
