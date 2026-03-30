const mongoose = require('mongoose');

/**
 * Invoice Schema — Core model
 *
 * Supports:
 *  - Draft and final invoices
 *  - Line items with per-item tax + discount
 *  - Invoice-level discount
 *  - GST (CGST / SGST / IGST), TDS, VAT, custom taxes
 *  - Partial payments
 *  - Multi-currency
 *  - Recurring invoices
 *  - Credit notes
 *  - Attachments
 */

// ─── Line Item Sub-schema ─────────────────────────────────────────────────
const lineItemSchema = new mongoose.Schema(
  {
    description: {
      type: String,
      required: [true, 'Item description is required'],
      trim: true,
    },
    secondLineDescription: {
      type: String,
      trim: true, // HSN/SAC code or additional detail
    },
    hsnSacCode: { type: String, trim: true }, // HSN (goods) or SAC (services)
    quantity: {
      type: Number,
      required: true,
      min: [0, 'Quantity cannot be negative'],
      default: 1,
    },
    unit: { type: String, trim: true, default: 'Nos' }, // Nos / Hrs / Kg / etc.
    unitPrice: {
      type: Number,
      required: true,
      min: [0, 'Unit price cannot be negative'],
    },
    // Discount on this specific line item
    discount: {
      type: { type: String, enum: ['percentage', 'fixed'], default: 'percentage' },
      value: { type: Number, default: 0, min: 0 },
    },
    // Tax on this line item
    taxRate: { type: Number, default: 0, min: 0 },   // Overall GST % e.g. 18
    cgstRate: { type: Number, default: 0 },           // 9% (half of 18%)
    sgstRate: { type: Number, default: 0 },           // 9%
    igstRate: { type: Number, default: 0 },           // 18% (interstate)
    cessRate: { type: Number, default: 0 },           // Additional cess

    // ── Computed (stored for reporting performance) ──
    discountAmount: { type: Number, default: 0 },
    taxableAmount: { type: Number, default: 0 },  // after discount
    cgstAmount: { type: Number, default: 0 },
    sgstAmount: { type: Number, default: 0 },
    igstAmount: { type: Number, default: 0 },
    cessAmount: { type: Number, default: 0 },
    taxAmount: { type: Number, default: 0 },
    amount: { type: Number, default: 0 },             // final line total (taxable + tax)
  },
  { _id: true }
);

// ─── Tax Breakdown Sub-schema (invoice level) ─────────────────────────────
const taxBreakdownSchema = new mongoose.Schema(
  {
    taxName: { type: String },  // e.g. "CGST @9%"
    taxRate: { type: Number },
    taxableAmount: { type: Number },
    taxAmount: { type: Number },
  },
  { _id: false }
);

// ─── Invoice-level Custom Charge ──────────────────────────────────────────
const customChargeSchema = new mongoose.Schema(
  {
    label: { type: String, trim: true },
    amount: { type: Number, default: 0 },
    taxable: { type: Boolean, default: false },
  },
  { _id: false }
);

// ─── Main Invoice Schema ───────────────────────────────────────────────────
const invoiceSchema = new mongoose.Schema(
  {
    // ── Relationships ──────────────────────────────────────────────────────
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    client: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Client',
      required: true,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },

    // ── Invoice Identity ───────────────────────────────────────────────────
    invoiceNumber: {
      type: String,
      required: true,
      trim: true,
    },
    invoiceDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    dueDate: {
      type: Date,
      index: true,
    },
    paymentTerms: {
      type: String,
      enum: ['Net 15', 'Net 30', 'Net 45', 'Net 60', 'Due on Receipt', 'Custom'],
      default: 'Net 30',
    },
    // Used only when paymentTerms === 'Custom'
    customPaymentDays: { type: Number, default: 0 },
    purchaseOrderNumber: { type: String, trim: true },
    referenceNumber: { type: String, trim: true },

    // ── Status ─────────────────────────────────────────────────────────────
    status: {
      type: String,
      enum: ['draft', 'sent', 'viewed', 'paid', 'partial', 'overdue', 'cancelled', 'refunded'],
      default: 'draft',
      index: true,
    },

    // ── Currency ───────────────────────────────────────────────────────────
    currency: {
      type: String,
      default: 'INR',
      uppercase: true,
    },
    exchangeRate: {
      type: Number,
      default: 1, // 1 if same as base currency
    },
    baseCurrency: {
      type: String,
      default: 'INR',
    },

    // ── Sender / Recipient (snapshot at invoice creation time) ────────────
    senderDetails: {
      name: String,
      email: String,
      phone: String,
      address: String,
      gstNumber: String,
      panNumber: String,
      logo: String,
    },
    recipientDetails: {
      name: String,
      companyName: String,
      email: String,
      phone: String,
      billingAddress: String,
      shippingAddress: String,
      gstNumber: String,
    },

    // ── Line Items ─────────────────────────────────────────────────────────
    lineItems: [lineItemSchema],

    // ── Financial Summary ──────────────────────────────────────────────────
    subtotal: { type: Number, default: 0 },           // sum of (qty * unitPrice) before any discount
    lineItemDiscountTotal: { type: Number, default: 0 },  // sum of per-item discounts

    // Invoice-level discount
    invoiceDiscount: {
      type: { type: String, enum: ['percentage', 'fixed'], default: 'percentage' },
      value: { type: Number, default: 0 },
      amount: { type: Number, default: 0 },            // computed
    },

    discountTotal: { type: Number, default: 0 },      // lineItemDiscountTotal + invoiceDiscount.amount
    taxableAmount: { type: Number, default: 0 },      // subtotal - discountTotal

    // Tax breakdown stored for GST filings
    taxBreakdown: [taxBreakdownSchema],
    cgstTotal: { type: Number, default: 0 },
    sgstTotal: { type: Number, default: 0 },
    igstTotal: { type: Number, default: 0 },
    cessTotal: { type: Number, default: 0 },
    taxTotal: { type: Number, default: 0 },           // sum of all taxes

    // TDS
    tdsRate: { type: Number, default: 0 },
    tdsAmount: { type: Number, default: 0 },

    // Additional charges
    shippingCharge: { type: Number, default: 0 },
    additionalCharges: [customChargeSchema],
    additionalChargesTotal: { type: Number, default: 0 },

    grandTotal: { type: Number, default: 0 },         // taxableAmount + taxTotal + shipping + additional - TDS

    // ── Payment Tracking ───────────────────────────────────────────────────
    amountPaid: { type: Number, default: 0 },
    balanceDue: { type: Number, default: 0 },         // grandTotal - amountPaid

    // ── Notes and Terms ────────────────────────────────────────────────────
    notes: { type: String, trim: true },
    termsAndConditions: { type: String, trim: true },
    internalNotes: { type: String, trim: true, select: false }, // staff only

    // ── Email ──────────────────────────────────────────────────────────────
    senderEmail: { type: String, trim: true, lowercase: true },
    recipientEmail: { type: String, trim: true, lowercase: true },
    ccEmails: [{ type: String, trim: true, lowercase: true }],
    bccEmails: [{ type: String, trim: true, lowercase: true }],
    emailMessage: { type: String },
    lastEmailSentAt: { type: Date },
    emailCount: { type: Number, default: 0 },

    // ── PDF ────────────────────────────────────────────────────────────────
    pdfUrl: { type: String },           // generated PDF path/URL
    pdfGeneratedAt: { type: Date },

    // ── Recurring Invoice ──────────────────────────────────────────────────
    isRecurring: { type: Boolean, default: false },
    recurringSettings: {
      frequency: {
        type: String,
        enum: ['weekly', 'monthly', 'quarterly', 'yearly'],
      },
      startDate: { type: Date },
      endDate: { type: Date },
      nextInvoiceDate: { type: Date },
      lastGeneratedAt: { type: Date },
      totalCycles: { type: Number },
      completedCycles: { type: Number, default: 0 },
    },
    parentInvoice: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Invoice', // if this was cloned/duplicated from another invoice
    },

    // ── Credit Note ────────────────────────────────────────────────────────
    isCreditNote: { type: Boolean, default: false },
    creditNoteFor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Invoice',
    },

    // ── Template ───────────────────────────────────────────────────────────
    template: {
      type: String,
      default: 'default', // template ID / name
    },

    // ── Reminder ───────────────────────────────────────────────────────────
    reminderEnabled: { type: Boolean, default: true },
    lastReminderSentAt: { type: Date },
    reminderCount: { type: Number, default: 0 },

    // ── Client Viewed ──────────────────────────────────────────────────────
    viewedAt: { type: Date },
    viewCount: { type: Number, default: 0 },
    viewToken: { type: String, index: true }, // unique token for client view link

    // ── GST Type (determines CGST/SGST vs IGST) ───────────────────────────
    gstType: {
      type: String,
      enum: ['intrastate', 'interstate', 'export', 'none'],
      default: 'intrastate',
    },

    // ── Webhook ────────────────────────────────────────────────────────────
    webhookSentAt: { type: Date },

    // ── Project / Engagement Details ───────────────────────────────────────
    project: {
      name:        { type: String, trim: true, maxlength: 200 },
      description: { type: String, trim: true, maxlength: 2000 },
      started:     { type: Boolean, default: false },
      startDate:   { type: Date },
      endDate:     { type: Date },
    },

    // ── Send Status ────────────────────────────────────────────────────────
    // Derived from `status` (sent/viewed/paid/partial/overdue = isSent true),
    // but stored explicitly so it can be set manually (e.g. sent outside the app).
    isSent: { type: Boolean, default: false },

    // ── Custom Fields ──────────────────────────────────────────────────────
    // Values keyed by CustomField.key — definitions live in CustomField collection.
    // Soft-deleted field definitions are kept so historical invoices stay readable.
    customFields: { type: Object, default: {} },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ─── Indexes ───────────────────────────────────────────────────────────────
invoiceSchema.index({ company: 1, invoiceNumber: 1 }, { unique: true });
invoiceSchema.index({ company: 1, status: 1 });
invoiceSchema.index({ company: 1, client: 1 });
invoiceSchema.index({ company: 1, dueDate: 1 });
invoiceSchema.index({ company: 1, status: 1, dueDate: 1 }); // overdue aging + reminder queries
invoiceSchema.index({ company: 1, invoiceDate: -1 });
invoiceSchema.index({ company: 1, createdAt: -1 });
// Full-text search on invoice number and reference
invoiceSchema.index({
  invoiceNumber: 'text',
  purchaseOrderNumber: 'text',
  'senderDetails.name': 'text',
  'recipientDetails.name': 'text',
});

// ─── Virtual: isOverdue ────────────────────────────────────────────────────
invoiceSchema.virtual('isOverdue').get(function () {
  return (
    this.status !== 'paid' &&
    this.status !== 'cancelled' &&
    this.dueDate &&
    new Date() > new Date(this.dueDate)
  );
});

// ─── Pre-save: auto mark overdue + sync isSent ────────────────────────────
invoiceSchema.pre('save', function (next) {
  if (
    this.dueDate &&
    new Date() > new Date(this.dueDate) &&
    !['paid', 'cancelled', 'draft'].includes(this.status)
  ) {
    this.status = 'overdue';
  }
  // Sync isSent from status — once sent (by any means) it stays true
  if (['sent', 'viewed', 'paid', 'partial', 'overdue'].includes(this.status)) {
    this.isSent = true;
  }
  next();
});

module.exports = mongoose.model('Invoice', invoiceSchema);
