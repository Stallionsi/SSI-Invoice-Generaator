const mongoose = require('mongoose');

/**
 * Company Schema
 * Stores the invoicing company's details (the sender)
 * One company can have many users, clients, and invoices
 */
const bankDetailsSchema = new mongoose.Schema(
  {
    bankName:      { type: String, trim: true },
    accountName:   { type: String, trim: true },
    accountNumber: { type: String, trim: true },
    ifscCode:      { type: String, trim: true, uppercase: true }, // India
    routingNumber: { type: String, trim: true },                  // US ACH routing
    branch:        { type: String, trim: true },
    swiftCode:     { type: String, trim: true, uppercase: true }, // international
  },
  { _id: false }
);

const addressSchema = new mongoose.Schema(
  {
    line1: { type: String, trim: true },
    line2: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    pincode: { type: String, trim: true },
    country: { type: String, trim: true, default: 'India' },
  },
  { _id: false }
);

const companySchema = new mongoose.Schema(
  {
    companyName: {
      type: String,
      required: [true, 'Company name is required'],
      trim: true,
      maxlength: [200, 'Company name cannot exceed 200 characters'],
    },
    // Short identifier used as the invoice number prefix.
    // e.g. "SSI/LLC" → invoice: "SSI/LLC-2026-27-0001"
    // Falls back to invoiceSettings.prefix → env INVOICE_NUMBER_PREFIX → 'INV'.
    // Optional; populate this in Company Settings for clean invoice numbering.
    shortCode: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: [10, 'Short code cannot exceed 10 characters'],
      match: [
        /^[A-Z0-9/_-]+$/,
        'Short code may only contain letters, numbers, /, _, and -',
      ],
    },
    address: addressSchema,
    // Indian tax identifiers
    gstNumber: {
      type: String,
      trim: true,
      uppercase: true,
      match: [
        /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/,
        'Invalid GST number format',
      ],
    },
    panNumber: {
      type: String,
      trim: true,
      uppercase: true,
      match: [/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, 'Invalid PAN number format'],
    },
    cinNumber: { type: String, trim: true }, // Company Identification Number
    phone: {
      type: String,
      trim: true,
    },
    alternatePhone: { type: String, trim: true },
    email: {
      type: String,
      trim: true,
      lowercase: true,
    },
    website: { type: String, trim: true },
    // Logo stored as URL (S3 or local path)
    logo: { type: String },
    // Digital signature image URL
    signature: { type: String },
    bankDetails: [bankDetailsSchema],
    // Invoice settings per company
    invoiceSettings: {
      prefix: { type: String, default: 'INV', trim: true },
      nextNumber: { type: Number, default: 1 },
      defaultCurrency: { type: String, default: 'INR' },
      defaultPaymentTerms: {
        type: String,
        enum: ['Net 15', 'Net 30', 'Net 45', 'Net 60', 'Due on Receipt', 'Custom'],
        default: 'Net 30',
      },
      defaultNotes: { type: String },
      defaultTerms: { type: String },
      taxRegistered: { type: Boolean, default: true },
      defaultTaxRate: { type: Number, default: 18 }, // GST 18%
    },
    // SMTP override per company (optional)
    smtpSettings: {
      host: { type: String },
      port: { type: Number },
      user: { type: String },
      pass: { type: String, select: false },
      fromName: { type: String },
      fromAddress: { type: String },
    },
    // Webhook endpoint for outbound event notifications
    webhookUrl: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
    // Owner/primary admin
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ─── Indexes ───────────────────────────────────────────────────────────────
companySchema.index({ gstNumber: 1 }, { sparse: true });
companySchema.index({ owner: 1 });
// sparse: true because shortCode is optional; null values are not indexed.
companySchema.index({ shortCode: 1 }, { sparse: true });

module.exports = mongoose.model('Company', companySchema);
