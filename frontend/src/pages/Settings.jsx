import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Eye, EyeOff } from 'lucide-react';
import { getCompany, createCompany, updateCompany, updateInvoiceSettings } from '../api/company.api';
import { changePassword } from '../api/auth.api';
import PageHeader from '../components/ui/PageHeader';
import Spinner from '../components/ui/Spinner';

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z
      .string()
      .min(8, 'At least 8 characters')
      .regex(/[A-Z]/, 'Must contain an uppercase letter')
      .regex(/[a-z]/, 'Must contain a lowercase letter')
      .regex(/[0-9]/, 'Must contain a number'),
    confirmPassword: z.string().min(1, 'Please confirm your new password'),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

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
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pwApiError, setPwApiError] = useState('');

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

  const pwForm = useForm({ resolver: zodResolver(passwordSchema) });

  const { mutate: doChangePassword, isPending: changingPw } = useMutation({
    mutationFn: changePassword,
    onSuccess: () => {
      toast.success('Password changed successfully!');
      pwForm.reset();
      setPwApiError('');
    },
    onError: (e) => {
      setPwApiError(e.response?.data?.message || 'Failed to change password');
    },
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

        {/* Change Password */}
        <div className="card">
          <h2 className="text-base font-semibold text-gray-800 mb-4">Change Password</h2>
          <form
            onSubmit={pwForm.handleSubmit((d) => { setPwApiError(''); doChangePassword(d); })}
            className="space-y-4"
          >
            {/* Current password */}
            <div>
              <label className="label">Current Password</label>
              <div className="relative">
                <input
                  {...pwForm.register('currentPassword')}
                  type={showCurrent ? 'text' : 'password'}
                  placeholder="••••••••"
                  className="input pr-10"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {pwForm.formState.errors.currentPassword && (
                <p className="text-red-500 text-xs mt-1">{pwForm.formState.errors.currentPassword.message}</p>
              )}
            </div>

            {/* New password */}
            <div>
              <label className="label">New Password</label>
              <div className="relative">
                <input
                  {...pwForm.register('newPassword')}
                  type={showNew ? 'text' : 'password'}
                  placeholder="••••••••"
                  className="input pr-10"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowNew((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {pwForm.formState.errors.newPassword && (
                <p className="text-red-500 text-xs mt-1">{pwForm.formState.errors.newPassword.message}</p>
              )}
              <p className="text-xs text-gray-400 mt-1">Min 8 chars, uppercase, lowercase, and a number.</p>
            </div>

            {/* Confirm new password */}
            <div>
              <label className="label">Confirm New Password</label>
              <div className="relative">
                <input
                  {...pwForm.register('confirmPassword')}
                  type={showConfirm ? 'text' : 'password'}
                  placeholder="••••••••"
                  className="input pr-10"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {pwForm.formState.errors.confirmPassword && (
                <p className="text-red-500 text-xs mt-1">{pwForm.formState.errors.confirmPassword.message}</p>
              )}
            </div>

            {pwApiError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-red-700 text-sm">{pwApiError}</p>
              </div>
            )}

            <div className="flex justify-end">
              <button type="submit" className="btn-primary" disabled={changingPw}>
                {changingPw ? <Spinner /> : 'Change Password'}
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
