const mongoose = require('mongoose');

/**
 * Payment Schema
 * Supports partial and full payments against an invoice
 * Multiple payments can be linked to a single invoice
 */
const paymentSchema = new mongoose.Schema(
  {
    invoice: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Invoice',
      required: true,
      index: true,
    },
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    client: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Client',
      index: true,
    },
    paymentAmount: {
      type: Number,
      required: [true, 'Payment amount is required'],
      min: [0.01, 'Payment amount must be greater than 0'],
    },
    paymentDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    paymentMethod: {
      type: String,
      enum: [
        'cash',
        'bank_transfer',
        'upi',
        'cheque',
        'credit_card',
        'debit_card',
        'net_banking',
        'neft',
        'rtgs',
        'imps',
        'paypal',
        'stripe',
        'razorpay',
        'other',
      ],
      required: true,
    },
    transactionId: {
      type: String,
      trim: true,
    },
    transactionReference: {
      type: String,
      trim: true, // Cheque number, UPI reference, etc.
    },
    currency: {
      type: String,
      default: 'INR',
      uppercase: true,
    },
    // For multi-currency: amount in invoice currency
    amountInInvoiceCurrency: { type: Number },
    exchangeRate: { type: Number, default: 1 },

    notes: { type: String, trim: true },

    // Bank details used for this payment
    bankAccount: { type: String, trim: true },

    // Payment receipt
    receiptNumber: { type: String, trim: true },
    receiptUrl: { type: String },    // PDF or URL

    status: {
      type: String,
      enum: ['pending', 'completed', 'failed', 'refunded'],
      default: 'completed',
    },

    // TDS deducted by client
    tdsDeducted: { type: Number, default: 0 },
    tdsRate: { type: Number, default: 0 },

    recordedBy: {
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
paymentSchema.index({ invoice: 1, createdAt: -1 });
paymentSchema.index({ company: 1, paymentDate: -1 });
paymentSchema.index({ company: 1, paymentMethod: 1 });
paymentSchema.index({ company: 1, status: 1, paymentDate: -1 }); // status-filtered payment reports
paymentSchema.index({ transactionId: 1 }, { sparse: true });

module.exports = mongoose.model('Payment', paymentSchema);
