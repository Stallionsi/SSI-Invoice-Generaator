import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { getCompany, createCompany, updateCompany, updateInvoiceSettings } from '../api/company.api';
import PageHeader from '../components/ui/PageHeader';
import Spinner from '../components/ui/Spinner';

const bankSchema = z.object({
  bankName:      z.string().optional(),
  accountName:   z.string().optional(),
  accountNumber: z.string().optional(),
  routingNumber: z.string().optional(),
  ifscCode:      z.string().optional(),
  branch:        z.string().optional(),
  swiftCode:     z.string().optional(),
});

const companySchema = z.object({
  companyName: z.string().min(1, 'Required'),
  gstNumber:   z.string().optional(),
  email:       z.string().email().optional().or(z.literal('')),
  phone:       z.string().optional(),
  website:     z.string().optional(),
  bankDetails: z.array(bankSchema).optional(),
  address: z.object({
    line1:   z.string().optional(),
    line2:   z.string().optional(),
    city:    z.string().optional(),
    state:   z.string().optional(),
    pincode: z.string().optional(),
    country: z.string().optional(),
  }).optional(),
  panNumber: z.string().optional(),
});

const invSchema = z.object({
  prefix:        z.string().optional(),
  nextNumber:    z.number().optional(),
  defaultDueDays: z.number().min(0).optional(),
  defaultNotes:  z.string().optional(),
  defaultCurrency: z.string().optional(),
});

export default function Settings() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['company'],
    queryFn: getCompany,
  });

  const company = data?.data?.data?.company;

  const companyForm = useForm({
    resolver: zodResolver(companySchema),
    values: company || {},
  });

  const invForm = useForm({
    resolver: zodResolver(invSchema),
    values: company?.invoiceSettings || {},
  });

  const { mutate: saveCompany, isPending: savingCompany } = useMutation({
    mutationFn: (d) => company ? updateCompany(d) : createCompany(d),
    onSuccess: () => {
      toast.success('Company settings saved!');
      qc.invalidateQueries({ queryKey: ['company'] });
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to save'),
  });

  const { mutate: saveInvSettings, isPending: savingInv } = useMutation({
    mutationFn: updateInvoiceSettings,
    onSuccess: () => {
      toast.success('Invoice settings saved!');
      qc.invalidateQueries({ queryKey: ['company'] });
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to save'),
  });

  if (isLoading) return <div className="flex justify-center py-12"><Spinner /></div>;

  return (
    <div>
      <PageHeader title="Settings" subtitle="Configure your company and invoice settings." />

      <div className="space-y-6 max-w-2xl">
        {/* Company */}
        <div className="card">
          <h2 className="text-base font-semibold text-gray-800 mb-4">Company Profile</h2>
          <form onSubmit={companyForm.handleSubmit(saveCompany)} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label">Company Name *</label>
                <input {...companyForm.register('companyName')} className="input" />
                {companyForm.formState.errors.companyName && (
                  <p className="text-red-500 text-xs mt-1">Required</p>
                )}
              </div>
              <div>
                <label className="label">GST Number</label>
                <input {...companyForm.register('gstNumber')} className="input" placeholder="27AAPFU0939F1ZV" />
              </div>
              <div>
                <label className="label">PAN Number</label>
                <input {...companyForm.register('panNumber')} className="input" placeholder="AAPFU0939F" />
              </div>
              <div>
                <label className="label">Email</label>
                <input {...companyForm.register('email')} type="email" className="input" />
              </div>
              <div>
                <label className="label">Phone</label>
                <input {...companyForm.register('phone')} className="input" />
              </div>
              <div className="md:col-span-2">
                <label className="label">Website</label>
                <input {...companyForm.register('website')} className="input" placeholder="https://yourcompany.com" />
              </div>
            </div>

            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Address</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="md:col-span-2">
                  <input {...companyForm.register('address.line1')} className="input" placeholder="Address Line 1" />
                </div>
                <div className="md:col-span-2">
                  <input {...companyForm.register('address.line2')} className="input" placeholder="Address Line 2" />
                </div>
                <input {...companyForm.register('address.city')}    className="input" placeholder="City" />
                <input {...companyForm.register('address.state')}   className="input" placeholder="State" />
                <input {...companyForm.register('address.pincode')} className="input" placeholder="PIN / ZIP Code" />
                <input {...companyForm.register('address.country')} className="input" placeholder="Country" />
              </div>
            </div>

            {/* ── Bank Details ── */}
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Bank Details</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="label">Bank Name</label>
                  <input {...companyForm.register('bankDetails.0.bankName')} className="input" placeholder="Bank of America" />
                </div>
                <div>
                  <label className="label">Account Name</label>
                  <input {...companyForm.register('bankDetails.0.accountName')} className="input" placeholder="Stallion SI LLC" />
                </div>
                <div>
                  <label className="label">Account Number</label>
                  <input {...companyForm.register('bankDetails.0.accountNumber')} className="input" placeholder="325165142287" />
                </div>
                <div>
                  <label className="label">Routing Number</label>
                  <input {...companyForm.register('bankDetails.0.routingNumber')} className="input" placeholder="121000358" />
                </div>
                <div>
                  <label className="label">IFSC Code <span className="text-gray-400 font-normal">(India)</span></label>
                  <input {...companyForm.register('bankDetails.0.ifscCode')} className="input" placeholder="HDFC0001234" />
                </div>
                <div>
                  <label className="label">SWIFT Code <span className="text-gray-400 font-normal">(International)</span></label>
                  <input {...companyForm.register('bankDetails.0.swiftCode')} className="input" placeholder="BOFAUS3N" />
                </div>
                <div>
                  <label className="label">Branch</label>
                  <input {...companyForm.register('bankDetails.0.branch')} className="input" placeholder="Main Branch" />
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <button type="submit" className="btn-primary" disabled={savingCompany}>
                {savingCompany ? <Spinner /> : 'Save Company'}
              </button>
            </div>
          </form>
        </div>

        {/* Invoice settings */}
        <div className="card">
          <h2 className="text-base font-semibold text-gray-800 mb-4">Invoice Settings</h2>
          <form onSubmit={invForm.handleSubmit(saveInvSettings)} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label">Invoice Prefix</label>
                <input {...invForm.register('prefix')} className="input" placeholder="INV-" />
              </div>
              <div>
                <label className="label">Next Invoice Number</label>
                <input
                  {...invForm.register('nextNumber', { valueAsNumber: true })}
                  type="number"
                  min="1"
                  className="input"
                />
              </div>
              <div>
                <label className="label">Default Due Days</label>
                <input
                  {...invForm.register('defaultDueDays', { valueAsNumber: true })}
                  type="number"
                  min="0"
                  className="input"
                  placeholder="30"
                />
              </div>
              <div>
                <label className="label">Default Currency</label>
                <select {...invForm.register('defaultCurrency')} className="input">
                  <option value="INR">INR</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="GBP">GBP</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="label">Default Notes</label>
                <textarea
                  {...invForm.register('defaultNotes')}
                  className="input"
                  rows={3}
                  placeholder="Payment terms, bank details…"
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
      </div>
    </div>
  );
}
