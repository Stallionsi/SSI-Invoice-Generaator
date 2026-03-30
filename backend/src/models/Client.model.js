const mongoose = require('mongoose');

/**
 * Client Schema
 * Represents the invoice recipient / customer
 */
const addressSchema = new mongoose.Schema(
  {
    line1:   { type: String, trim: true },
    line2:   { type: String, trim: true },
    city:    { type: String, trim: true },
    state:   { type: String, trim: true },
    pincode: { type: String, trim: true },
    zip:     { type: String, trim: true }, // US/international ZIP
    country: { type: String, trim: true, default: 'India' },
  },
  { _id: false }
);

// Country-specific tax identifiers — populated based on client's country
const taxIdentifiersSchema = new mongoose.Schema(
  {
    // India
    gstNumber: { type: String, trim: true, uppercase: true },
    panNumber: { type: String, trim: true, uppercase: true },
    // United States
    ein:        { type: String, trim: true }, // Employer Identification Number (XX-XXXXXXX)
    ssn:        { type: String, trim: true, select: false }, // sensitive — excluded from queries
    stateTaxId: { type: String, trim: true }, // state-level tax registration
    // UK / EU / International
    vatNumber:  { type: String, trim: true, uppercase: true },
    // Generic fallback (any country)
    taxLabel:   { type: String, trim: true }, // e.g. "ABN", "TRN"
    taxValue:   { type: String, trim: true },
  },
  { _id: false }
);

const clientSchema = new mongoose.Schema(
  {
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    clientName: {
      type: String,
      required: [true, 'Client name is required'],
      trim: true,
      maxlength: [150, 'Client name cannot exceed 150 characters'],
    },
    companyName: {
      type: String,
      trim: true,
      maxlength: [200, 'Company name cannot exceed 200 characters'],
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email'],
    },
    phone: { type: String, trim: true },
    alternatePhone: { type: String, trim: true },
    // Country drives which tax fields are shown/validated
    country: {
      type: String,
      trim: true,
      default: 'India',
    },
    billingAddress:  addressSchema,
    shippingAddress: addressSchema,
    // Structured tax identifiers — field set depends on country
    taxIdentifiers: taxIdentifiersSchema,
    // Legacy flat fields kept for backward compatibility with existing invoices/snapshots
    gstNumber: { type: String, trim: true, uppercase: true },
    panNumber:  { type: String, trim: true, uppercase: true },
    // Currency preference for this client
    currency: {
      type: String,
      default: 'INR',
      uppercase: true,
    },
    // Payment terms override
    paymentTerms: {
      type: String,
      enum: ['Net 15', 'Net 30', 'Net 45', 'Net 60', 'Due on Receipt', 'Custom'],
      default: 'Net 30',
    },
    // Used only when paymentTerms === 'Custom' — number of days after invoice date
    customPaymentDays: {
      type: Number,
      min: 0,
      default: 30,
    },
    // Internal notes about this client
    notes: { type: String, trim: true },
    // Client portal access
    portalEnabled: { type: Boolean, default: false },
    portalPassword: { type: String, select: false },
    isActive: { type: Boolean, default: true },
    // Stats (denormalized for performance)
    stats: {
      totalInvoices: { type: Number, default: 0 },
      totalRevenue: { type: Number, default: 0 },
      pendingAmount: { type: Number, default: 0 },
      lastInvoiceDate: { type: Date },
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },

    // ── Custom Fields ──────────────────────────────────────────────────────
    // Map type gives Mongoose proper dot-notation query support and correct
    // serialisation while behaving as a plain object in .lean() reads.
    customFields: { type: Map, of: mongoose.Schema.Types.Mixed, default: {} },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ─── Indexes ───────────────────────────────────────────────────────────────
clientSchema.index({ company: 1, email: 1 });
clientSchema.index({ company: 1, clientName: 'text', companyName: 'text' }); // full-text search
clientSchema.index({ company: 1, isActive: 1 });

module.exports = mongoose.model('Client', clientSchema);
