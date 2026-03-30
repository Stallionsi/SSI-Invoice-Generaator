const Decimal = require('decimal.js');
const mongoose = require('mongoose');
const Payment = require('../models/Payment.model');
const Invoice = require('../models/Invoice.model');
const { addEmailJob, addWebhookJob, addPdfJob } = require('../config/queue');
const { parsePagination, buildPaginationMeta } = require('../utils/pagination.util');
const logger = require('../utils/logger');

/**
 * Record a payment (partial or full) against an invoice.
 * Atomically updates invoice amountPaid and status.
 */
const recordPayment = async (invoiceId, companyId, data, userId) => {
  const invoice = await Invoice.findOne({ _id: invoiceId, company: companyId });
  if (!invoice) throw Object.assign(new Error('Invoice not found'), { statusCode: 404 });

  if (invoice.status === 'cancelled') {
    throw Object.assign(new Error('Cannot record payment for a cancelled invoice'), { statusCode: 400 });
  }

  // Use Decimal for precise financial arithmetic
  const dGrandTotal   = new Decimal(invoice.grandTotal);
  const dAmountPaid   = new Decimal(invoice.amountPaid);
  const dPayment      = new Decimal(data.paymentAmount);
  const dNewAmountPaid = dAmountPaid.plus(dPayment);

  if (dNewAmountPaid.gt(dGrandTotal.plus(new Decimal('0.01')))) {
    throw Object.assign(
      new Error(`Payment exceeds balance due (${invoice.balanceDue})`),
      { statusCode: 400 }
    );
  }

  const newAmountPaid = dNewAmountPaid.toNumber();
  const balanceDue    = dGrandTotal.minus(dNewAmountPaid).toDecimalPlaces(2).toNumber();
  const newStatus     = new Decimal(balanceDue).lte(new Decimal('0.01')) ? 'paid' : 'partial';

  const paymentData = {
    invoice:              invoiceId,
    company:              companyId,
    client:               invoice.client,
    paymentAmount:        dPayment.toNumber(),
    paymentDate:          data.paymentDate || new Date(),
    paymentMethod:        data.paymentMethod,
    transactionId:        data.transactionId,
    transactionReference: data.transactionReference,
    currency:             invoice.currency,
    notes:                data.notes,
    bankAccount:          data.bankAccount,
    tdsDeducted:          data.tdsDeducted || 0,
    tdsRate:              data.tdsRate     || 0,
    recordedBy:           userId,
  };

  // Transaction: payment creation + invoice balance update are atomic
  const session = await mongoose.startSession();
  let payment;
  try {
    session.startTransaction();
    [payment] = await Payment.create([paymentData], { session });
    await Invoice.findByIdAndUpdate(invoiceId, {
      amountPaid: newAmountPaid,
      balanceDue: Math.max(0, balanceDue),
      status:     newStatus,
    }, { session });
    await session.commitTransaction();
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }

  // Regenerate PDF so it reflects the updated amountPaid / balanceDue / status.
  // Queued as a background job so the API responds immediately.
  try { await addPdfJob(invoiceId.toString()); }
  catch (e) { logger.error(`[payment] addPdfJob failed for invoice ${invoiceId}: ${e.message}`); }

  // Queue jobs after commit (Redis is outside the transaction)
  await addEmailJob('payment-receipt', {
    invoiceId:      invoiceId.toString(),
    paymentId:      payment._id.toString(),
    companyId:      companyId.toString(),
    recipientEmail: invoice.recipientEmail,
  });

  // Emit webhook events
  await addWebhookJob('payment.recorded', { invoiceId: invoiceId.toString(), paymentId: payment._id.toString(), paymentAmount: payment.paymentAmount, paymentMethod: payment.paymentMethod, balanceDue, newStatus }, companyId);
  if (newStatus === 'paid') {
    await addWebhookJob('invoice.paid', { invoiceId: invoiceId.toString(), invoiceNumber: invoice.invoiceNumber, grandTotal: invoice.grandTotal }, companyId);
  }

  return payment;
};

const listByInvoice = async (invoiceId, companyId) => {
  const invoice = await Invoice.findOne({ _id: invoiceId, company: companyId }).lean();
  if (!invoice) throw Object.assign(new Error('Invoice not found'), { statusCode: 404 });

  return Payment.find({ invoice: invoiceId }).sort({ paymentDate: -1 }).lean();
};

const listAll = async (companyId, query = {}) => {
  const { page, limit, skip, sort } = parsePagination(query);
  const filter = { company: companyId };

  if (query.method) filter.paymentMethod = query.method;
  if (query.fromDate || query.toDate) {
    filter.paymentDate = {};
    if (query.fromDate) filter.paymentDate.$gte = new Date(query.fromDate);
    if (query.toDate)   filter.paymentDate.$lte = new Date(query.toDate);
  }

  const [payments, total] = await Promise.all([
    Payment.find(filter)
      .populate('invoice', 'invoiceNumber grandTotal')
      .populate('client', 'clientName')
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean(),
    Payment.countDocuments(filter),
  ]);

  return { payments, pagination: buildPaginationMeta(total, page, limit) };
};

module.exports = { recordPayment, listByInvoice, listAll };
