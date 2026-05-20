import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Spinner from '../ui/Spinner';

// ─── Country list ──────────────────────────────────────────────────────────────
const COUNTRIES = [
  'India', 'United States', 'United Kingdom', 'Canada', 'Australia',
  'Germany', 'France', 'Singapore', 'UAE', 'Other',
];

// ─── Zod schema ────────────────────────────────────────────────────────────────
const addressSchema = z.object({
  line1:   z.string().optional(),
  line2:   z.string().optional(),
  city:    z.string().optional(),
  state:   z.string().optional(),
  pincode: z.string().optional(),
  zip:     z.string().optional(),
  country: z.string().optional(),
}).optional();

const shippingAddressSchema = z.object({
  line1:   z.string().optional(),
  line2:   z.string().optional(),
  city:    z.string().optional(),
  state:   z.string().optional(),
  pincode: z.string().optional(),
  zip:     z.string().optional(),
}).optional();

const taxIdentifiersSchema = z.object({
  // India
  gstNumber: z.string().optional(),
  panNumber: z.string().optional(),
  // US
  ein:        z.string().optional(),
  ssn:        z.string().optional(),
  stateTaxId: z.string().optional(),
  // UK / EU
  vatNumber: z.string().optional(),
  // Generic
  taxLabel: z.string().optional(),
  taxValue: z.string().optional(),
}).optional();

const schema = z.object({
  clientName:         z.string().min(1, 'Name is required'),
  companyName:        z.string().optional(),
  country:            z.string().default('India'),
  email:              z.string().email('Invalid email').optional().or(z.literal('')),
  phone:              z.string().optional(),
  alternatePhone:     z.string().optional(),
  currency:           z.string().default('INR'),
  paymentTerms:       z.string().optional(),
  customPaymentDays:  z.coerce.number().min(1).optional(),
  notes:              z.string().optional(),
  billingAddress:  addressSchema,
  shippingAddress: shippingAddressSchema,
  taxIdentifiers:  taxIdentifiersSchema,
  // Legacy flat fields (kept for backward compat — still sent for India clients)
  gstNumber: z.string().optional(),
  panNumber:  z.string().optional(),
}).superRefine((data, ctx) => {
  const country = data.country || 'India';
  const ti = data.taxIdentifiers || {};

  if (country === 'India') {
    if (ti.gstNumber && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(ti.gstNumber)) {
      ctx.addIssue({ path: ['taxIdentifiers', 'gstNumber'], code: z.ZodIssueCode.custom, message: 'Invalid GST format (e.g. 27AAPFU0939F1ZV)' });
    }
    if (ti.panNumber && !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(ti.panNumber)) {
      ctx.addIssue({ path: ['taxIdentifiers', 'panNumber'], code: z.ZodIssueCode.custom, message: 'Invalid PAN format (e.g. AAPFU0939F)' });
    }
  }
  if (country === 'United States') {
    if (ti.ein && !/^\d{2}-?\d{7}$/.test(ti.ein)) {
      ctx.addIssue({ path: ['taxIdentifiers', 'ein'], code: z.ZodIssueCode.custom, message: 'Invalid EIN format (e.g. 12-3456789)' });
    }
  }
});

// ─── TaxIdentifiersSection ─────────────────────────────────────────────────────
function TaxIdentifiersSection({ country, register, errors }) {
  const ti = errors?.taxIdentifiers || {};

  if (country === 'India') {
    return (
      <>
        <div>
          <label className="label">GST Number</label>
          <input {...register('taxIdentifiers.gstNumber')} className="input" placeholder="27AAPFU0939F1ZV" />
          {ti.gstNumber && <p className="text-red-500 text-xs mt-1">{ti.gstNumber.message}</p>}
        </div>
        <div>
          <label className="label">PAN Number</label>
          <input {...register('taxIdentifiers.panNumber')} className="input" placeholder="AAPFU0939F" />
          {ti.panNumber && <p className="text-red-500 text-xs mt-1">{ti.panNumber.message}</p>}
        </div>
      </>
    );
  }

  if (country === 'United States') {
    return (
      <>
        <div>
          <label className="label">EIN (Employer Identification Number)</label>
          <input {...register('taxIdentifiers.ein')} className="input" placeholder="12-3456789" />
          {ti.ein && <p className="text-red-500 text-xs mt-1">{ti.ein.message}</p>}
        </div>
        <div>
          <label className="label">State Tax ID</label>
          <input {...register('taxIdentifiers.stateTaxId')} className="input" placeholder="State tax registration number" />
        </div>
        <div>
          <label className="label">SSN (optional, sensitive)</label>
          <input {...register('taxIdentifiers.ssn')} className="input" type="password" placeholder="XXX-XX-XXXX" autoComplete="off" />
        </div>
      </>
    );
  }

  if (country === 'United Kingdom' || country === 'Germany' || country === 'France') {
    return (
      <div>
        <label className="label">VAT Number</label>
        <input {...register('taxIdentifiers.vatNumber')} className="input" placeholder="GB123456789" />
        {ti.vatNumber && <p className="text-red-500 text-xs mt-1">{ti.vatNumber.message}</p>}
      </div>
    );
  }

  // Generic fallback for Other / Canada / Australia / UAE / etc.
  return (
    <>
      <div>
        <label className="label">Tax ID Type</label>
        <input {...register('taxIdentifiers.taxLabel')} className="input" placeholder="e.g. ABN, TRN, GST No." />
      </div>
      <div>
        <label className="label">Tax ID Value</label>
        <input {...register('taxIdentifiers.taxValue')} className="input" placeholder="Tax registration number" />
      </div>
    </>
  );
}

// ─── AddressFields ─────────────────────────────────────────────────────────────
function AddressFields({ prefix, register, country, showCountry = false }) {
  const isUS = country === 'United States' || country === 'Canada';
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div className="md:col-span-2">
        <input {...register(`${prefix}.line1`)} className="input" placeholder="Address Line 1" />
      </div>
      <div className="md:col-span-2">
        <input {...register(`${prefix}.line2`)} className="input" placeholder="Address Line 2" />
      </div>
      <input {...register(`${prefix}.city`)}  className="input" placeholder="City" />
      <input {...register(`${prefix}.state`)} className="input" placeholder="State / Province" />
      {isUS ? (
        <input {...register(`${prefix}.zip`)}     className="input" placeholder="ZIP Code" />
      ) : (
        <input {...register(`${prefix}.pincode`)} className="input" placeholder="PIN / Postal Code" />
      )}
      {showCountry && (
        <input {...register(`${prefix}.country`)} className="input" placeholder="Country" />
      )}
    </div>
  );
}

// ─── Main form ─────────────────────────────────────────────────────────────────
export default function ClientForm({ defaultValues, onSubmit, isLoading, submitLabel = 'Save Client' }) {
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: defaultValues || { country: 'India', currency: 'INR', paymentTerms: 'Net 30', customPaymentDays: 30 },
  });

  const country      = useWatch({ control, name: 'country',      defaultValue: defaultValues?.country      || 'India' });
  const paymentTerms = useWatch({ control, name: 'paymentTerms', defaultValue: defaultValues?.paymentTerms || 'Net 30' });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">

      {/* ── Basic Info ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label">Client Name <span className="text-red-500">*</span></label>
          <input {...register('clientName')} className="input" placeholder="John Doe" />
          {errors.clientName && <p className="text-red-500 text-xs mt-1">{errors.clientName.message}</p>}
        </div>

        <div>
          <label className="label">Company Name</label>
          <input {...register('companyName')} className="input" placeholder="ACME Corp" />
        </div>

        <div>
          <label className="label">Email</label>
          <input {...register('email')} type="email" className="input" placeholder="client@example.com" />
          {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
        </div>

        <div>
          <label className="label">Phone</label>
          <input {...register('phone')} className="input" placeholder="+91 98765 43210" />
        </div>

        <div>
          <label className="label">Alternate Phone</label>
          <input {...register('alternatePhone')} className="input" placeholder="+91 98765 43210" />
        </div>

        {/* Country — drives which tax fields appear */}
        <div>
          <label className="label">Country</label>
          <select {...register('country')} className="input">
            {COUNTRIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">Currency</label>
          <select {...register('currency')} className="input">
            <option value="INR">INR — Indian Rupee</option>
            <option value="USD">USD — US Dollar</option>
            <option value="EUR">EUR — Euro</option>
            <option value="GBP">GBP — British Pound</option>
            <option value="AUD">AUD — Australian Dollar</option>
            <option value="CAD">CAD — Canadian Dollar</option>
            <option value="SGD">SGD — Singapore Dollar</option>
            <option value="AED">AED — UAE Dirham</option>
          </select>
        </div>

        <div>
          <label className="label">Payment Terms</label>
          <select {...register('paymentTerms')} className="input">
            <option value="Net 30">Net 30</option>
            <option value="Net 15">Net 15</option>
            <option value="Net 45">Net 45</option>
            <option value="Net 60">Net 60</option>
            <option value="Due on Receipt">Due on Receipt</option>
            <option value="Custom">Custom</option>
          </select>
        </div>

        {paymentTerms === 'Custom' && (
          <div>
            <label className="label">Custom Payment Days</label>
            <input
              {...register('customPaymentDays')}
              type="number"
              min="1"
              className="input"
              placeholder="e.g. 21"
            />
            {errors.customPaymentDays && (
              <p className="text-red-500 text-xs mt-1">{errors.customPaymentDays.message}</p>
            )}
          </div>
        )}
      </div>

      {/* ── Tax Identifiers (country-driven) ── */}
      <div>
        <p className="text-sm font-medium text-gray-700 mb-3">
          Tax Information
          <span className="ml-2 text-xs font-normal text-gray-400">({country})</span>
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TaxIdentifiersSection country={country} register={register} errors={errors} />
        </div>
      </div>

      {/* ── Billing Address ── */}
      <div>
        <p className="text-sm font-medium text-gray-700 mb-2">Billing Address</p>
        <AddressFields prefix="billingAddress" register={register} country={country} showCountry />
      </div>

      {/* ── Shipping Address ── */}
      <div>
        <p className="text-sm font-medium text-gray-700 mb-2">Shipping Address</p>
        <AddressFields prefix="shippingAddress" register={register} country={country} />
      </div>

      {/* ── Notes ── */}
      <div>
        <label className="label">Notes</label>
        <textarea
          {...register('notes')}
          rows={3}
          className="input"
          placeholder="Internal notes about this client…"
        />
      </div>

      <div className="flex justify-end pt-2">
        <button type="submit" className="btn-primary" disabled={isLoading}>
          {isLoading ? <Spinner /> : submitLabel}
        </button>
      </div>
    </form>
  );
}
