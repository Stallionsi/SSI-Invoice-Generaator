const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');
const Invoice = require('../models/Invoice.model');
const Client = require('../models/Client.model');
const Company = require('../models/Company.model');
const { generateInvoicePdf } = require('./pdf.service');
const { calculateLineItem, calculateInvoiceTotals, calculateDueDate } = require('../utils/calculation.util');
const { reserveNextInvoiceNumber } = require('../utils/invoiceNumber.util');
const { parsePagination, buildPaginationMeta, parseInvoiceFilters } = require('../utils/pagination.util');
const { addPdfJob, scheduleReminder, addWebhookJob } = require('../config/queue');
const emailService = require('./email.service');
const { getExchangeRate } = require('./exchangeRate.service');
const { DEFAULT_CURRENCY } = require('../config/env');
const clientService = require('./client.service');
const dayjs = require('dayjs');
const logger = require('../utils/logger');

// ─── Build Snapshot Helpers ────────────────────────────────────────────────
const buildSenderSnapshot = (company) => ({
  name:       company.companyName,
  email:      company.email,
  phone:      company.phone,
  address:    [
    company.address?.line1,
    company.address?.line2,
    [company.address?.city, company.address?.state].filter(Boolean).join(', '),
    [company.address?.pincode, company.address?.country].filter(Boolean).join(', '),
  ].filter(Boolean).join('\n'),
  gstNumber:  company.gstNumber,
  panNumber:  company.panNumber,
  website:    company.website,
  logo:       company.logo,
});

const buildRecipientSnapshot = (client) => ({
  name:            client.clientName,
  companyName:     client.companyName,
  email:           client.email,
  phone:           client.phone,
  billingAddress:  client.billingAddress
    ? [
        client.billingAddress.line1,
        client.billingAddress.line2,
        [client.billingAddress.city, client.billingAddress.state].filter(Boolean).join(' '),
        client.billingAddress.zip || client.billingAddress.pincode,
        client.billingAddress.country,
      ].filter(Boolean).join('\n')
    : '',
  shippingAddress: client.shippingAddress
    ? [client.shippingAddress.line1, client.shippingAddress.city, client.shippingAddress.state, client.shippingAddress.pincode].filter(Boolean).join(', ')
    : '',
  gstNumber: client.gstNumber,
});

// ─── Create Invoice ────────────────────────────────────────────────────────
const create = async (data, companyId, userId) => {
  // Fetch company + client in parallel
  const [company, client] = await Promise.all([
    Company.findById(companyId),
    Client.findOne({ _id: data.client, company: companyId }),
  ]);
  if (!company) throw Object.assign(new Error('Company not found'), { statusCode: 404 });
  if (!client)  throw Object.assign(new Error('Client not found'), { statusCode: 404 });

  // Resolve currency FIRST — needed for currency-aware tax calculations
  const invoiceCurrency = data.currency || company.invoiceSettings?.defaultCurrency || DEFAULT_CURRENCY;

  // GST type is only meaningful for INR invoices; force 'none' for foreign currencies
  // to prevent CGST/SGST labels appearing on non-INR invoices.
  const gstType = invoiceCurrency === 'INR' ? (data.gstType || 'intrastate') : 'none';

  // Calculate line items (currency-aware: non-INR uses generic tax, not CGST/SGST)
  const lineItems = data.lineItems.map((item) => calculateLineItem(item, gstType, invoiceCurrency));

  // Calculate invoice totals
  const totals = calculateInvoiceTotals(lineItems, data.invoiceDiscount, {
    tdsRate:           data.tdsRate,
    shippingCharge:    data.shippingCharge,
    additionalCharges: data.additionalCharges,
    gstType,
    currency:          invoiceCurrency,
  });
  let exchangeRate = data.exchangeRate || 1;
  if (invoiceCurrency !== DEFAULT_CURRENCY && !data.exchangeRate) {
    exchangeRate = await getExchangeRate(invoiceCurrency, DEFAULT_CURRENCY);
  }

  // Due date — priority: explicit dueDate > data.paymentTerms > client.paymentTerms > company default > Net 30
  const invoiceDate = new Date(data.invoiceDate || Date.now());
  const dueDate     = data.dueDate
    ? new Date(data.dueDate)
    : calculateDueDate(
        invoiceDate,
        data.paymentTerms
          || client.paymentTerms
          || company.invoiceSettings?.defaultPaymentTerms
          || 'Net 30',
      );

  // ── Invoice Number Resolution (per-client sequence) ──────────────────────
  //
  // Numbers are scoped to (company + client), so each client has their own
  // independent sequence:  Client A → 0001, 0002, 0003
  //                        Client B → 0001, 0002  (same company, separate counter)
  //
  // The (company, client, invoiceNumber) unique index on Invoice enforces that
  // no two invoices for the same client share a number.
  //
  // IMPORTANT — reserve BEFORE any transaction: the atomic $inc commits
  // immediately.  If creation later fails, the number is burned (a gap appears).
  // Gaps are acceptable; duplicates are not.
  let invoiceNumber;
  if (data.invoiceNumber && data.invoiceNumber.trim()) {
    invoiceNumber = data.invoiceNumber.trim();

    // Uniqueness check scoped to this client (same number may exist for others).
    const taken = await Invoice.exists({ company: companyId, client: client._id, invoiceNumber });
    if (taken) {
      throw Object.assign(
        new Error(`Invoice number "${invoiceNumber}" is already in use for this client`),
        { statusCode: 409 },
      );
    }
  } else {
    // Atomic per-client sequence — safe under concurrent invoice creation.
    invoiceNumber = await reserveNextInvoiceNumber(companyId, { clientId: client._id });
  }

  // Unique view token for client-facing link
  const viewToken = uuidv4();

  const invoiceData = {
    company:    companyId,
    client:     client._id,
    createdBy:  userId,
    invoiceNumber,
    invoiceDate,
    dueDate,
    paymentTerms:         data.paymentTerms || company.invoiceSettings?.defaultPaymentTerms,
    purchaseOrderNumber:  data.purchaseOrderNumber,
    referenceNumber:      data.referenceNumber,
    status:               'draft',
    currency:             invoiceCurrency,
    exchangeRate,
    baseCurrency:         DEFAULT_CURRENCY,
    gstType,
    senderDetails:    buildSenderSnapshot(company),
    recipientDetails: buildRecipientSnapshot(client),
    lineItems,
    ...totals,
    balanceDue: totals.grandTotal,
    notes:              data.notes || company.invoiceSettings?.defaultNotes,
    termsAndConditions: data.termsAndConditions || company.invoiceSettings?.defaultTerms,
    internalNotes:      data.internalNotes,
    senderEmail:        data.senderEmail || company.email,
    recipientEmail:     data.recipientEmail || client.email,
    ccEmails:           data.ccEmails  || [],
    bccEmails:          data.bccEmails || [],
    emailMessage:       data.emailMessage,
    template:           data.template || 'default',
    reminderEnabled:    data.reminderEnabled !== false,
    isRecurring:        data.isRecurring || false,
    recurringSettings:  data.recurringSettings,
    additionalCharges:  data.additionalCharges || [],
    viewToken,
  };

  // Transaction: invoice creation + client stats are atomic
  const session = await mongoose.startSession();
  let invoice;
  try {
    session.startTransaction();
    [invoice] = await Invoice.create([invoiceData], { session });
    await clientService.updateStats(client._id, { invoiceDelta: 1, pendingDelta: totals.grandTotal }, session);
    await session.commitTransaction();
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }

  // Queue background jobs — fire-and-forget so a Redis failure never rolls back the invoice.
  // PDF is pre-generated here so it is ready when the user clicks Send.
  try { await addPdfJob(invoice._id.toString()); }
  catch (e) { logger.error(`addPdfJob failed for ${invoice.invoiceNumber}: ${e.message}`); }

  try {
    await addWebhookJob('invoice.created', {
      invoiceId:     invoice._id.toString(),
      invoiceNumber: invoice.invoiceNumber,
      grandTotal:    invoice.grandTotal,
      currency:      invoice.currency,
      status:        invoice.status,
    }, companyId);
  } catch (e) { logger.error(`addWebhookJob failed for ${invoice.invoiceNumber}: ${e.message}`); }

  // Email is NOT sent here. It is sent only when the user explicitly clicks
  // "Send" on the invoice detail page (POST /invoices/:id/send).
  return invoice;
};

// ─── List Invoices ────────────────────────────────────────────────────────
const list = async (companyId, query = {}) => {
  const { page, limit, skip, sort } = parsePagination(query);
  const filter = parseInvoiceFilters(query, companyId);

  const [invoices, total] = await Promise.all([
    Invoice.find(filter)
      .populate('client', 'clientName companyName email')
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean(),
    Invoice.countDocuments(filter),
  ]);

  return { invoices, pagination: buildPaginationMeta(total, page, limit) };
};

// ─── Get Single Invoice ────────────────────────────────────────────────────
const getById = async (invoiceId, companyId) => {
  const invoice = await Invoice.findOne({ _id: invoiceId, company: companyId })
    .populate('client', 'clientName companyName email phone billingAddress gstNumber')
    .lean();
  if (!invoice) throw Object.assign(new Error('Invoice not found'), { statusCode: 404 });
  return invoice;
};

// ─── Update Invoice ────────────────────────────────────────────────────────
const update = async (invoiceId, companyId, data) => {
  const invoice = await Invoice.findOne({ _id: invoiceId, company: companyId });
  if (!invoice) throw Object.assign(new Error('Invoice not found'), { statusCode: 404 });

  if (invoice.status === 'paid') {
    throw Object.assign(new Error('Cannot edit a paid invoice'), { statusCode: 400 });
  }

  // Recalculate if line items are provided
  if (data.lineItems) {
    const currency  = data.currency || invoice.currency || DEFAULT_CURRENCY;
    const gstType   = currency === 'INR'
      ? (data.gstType || invoice.gstType || 'intrastate')
      : 'none';
    const lineItems = data.lineItems.map((item) => calculateLineItem(item, gstType, currency));
    const totals    = calculateInvoiceTotals(lineItems, data.invoiceDiscount || invoice.invoiceDiscount, {
      tdsRate:           data.tdsRate ?? invoice.tdsRate,
      shippingCharge:    data.shippingCharge ?? invoice.shippingCharge,
      additionalCharges: data.additionalCharges ?? invoice.additionalCharges,
      gstType,
      currency,
    });

    const { calculateBalanceDue } = require('../utils/calculation.util');
    Object.assign(data, { lineItems, ...totals, balanceDue: calculateBalanceDue(totals.grandTotal, invoice.amountPaid) });
  }

  Object.assign(invoice, data);
  await invoice.save();

  // Regenerate PDF on update
  await generateInvoicePdf(invoice._id);

  return invoice;
};

// ─── Cancel Invoice ────────────────────────────────────────────────────────
const cancel = async (invoiceId, companyId) => {
  const invoice = await Invoice.findOneAndDelete({ _id: invoiceId, company: companyId });
  if (!invoice) throw Object.assign(new Error('Invoice not found'), { statusCode: 404 });
  return invoice;
};

// ─── Send Invoice Email ────────────────────────────────────────────────────
const sendInvoiceEmail = async (invoiceId, companyId, emailData, userId) => {
  console.log('Send button clicked', { invoiceId, recipientEmail: emailData.recipientEmail });

  // ── Always fetch a completely fresh copy from DB ──────────────────────────
  // Never reuse a previously fetched invoice object — payment recording or
  // any concurrent edit may have changed currency, amountPaid, balanceDue, etc.
  // Full populate ensures senderDetails/recipientDetails are also up-to-date.
  const freshInvoice = await Invoice.findOne({ _id: invoiceId, company: companyId })
    .populate('client', 'clientName email phone billingAddress gstNumber')
    .lean();
  if (!freshInvoice) throw Object.assign(new Error('Invoice not found'), { statusCode: 404 });

  // Debug log — confirms exactly which data the PDF will be built from.
  console.log('EMAIL INVOICE:', {
    id:       String(freshInvoice._id),
    number:   freshInvoice.invoiceNumber,
    currency: freshInvoice.currency,
    total:    freshInvoice.grandTotal,
    paid:     freshInvoice.amountPaid,
    balance:  freshInvoice.balanceDue,
    status:   freshInvoice.status,
  });
  // ─────────────────────────────────────────────────────────────────────────

  // ── Regenerate PDF from the freshInvoice object we already have ───────────
  // Passing the plain object directly to generateInvoicePdf means the PDF is
  // built from exactly the same snapshot we verified above — no second DB
  // fetch inside the PDF generator that could return a different version.
  logger.info(`[invoice] Regenerating PDF for ${freshInvoice.invoiceNumber} (currency: ${freshInvoice.currency}) before email send`);
  const pdfPath = await generateInvoicePdf(freshInvoice);
  // ─────────────────────────────────────────────────────────────────────────

  console.log('Email sending started', { invoiceId, recipientEmail: emailData.recipientEmail });

  // Send email directly via Nodemailer (not queued)
  await emailService.sendInvoiceEmail({
    invoiceId:      freshInvoice._id.toString(),
    companyId:      companyId.toString(),
    userId:         userId.toString(),
    recipientEmail: emailData.recipientEmail || freshInvoice.recipientEmail,
    ccEmails:       emailData.ccEmails       || freshInvoice.ccEmails  || [],
    bccEmails:      emailData.bccEmails      || freshInvoice.bccEmails || [],
    subject:        emailData.subject,
    message:        emailData.message        || freshInvoice.emailMessage,
    pdfPath,                                  // pass local path — never re-fetch from CDN
  });

  console.log('Email sent successfully', { invoiceId, invoiceNumber: freshInvoice.invoiceNumber });

  // Update status to 'sent' if draft
  if (freshInvoice.status === 'draft') {
    await Invoice.findByIdAndUpdate(invoiceId, {
      status: 'sent',
      lastEmailSentAt: new Date(),
      $inc: { emailCount: 1 },
    });
  } else {
    await Invoice.findByIdAndUpdate(invoiceId, {
      lastEmailSentAt: new Date(),
      $inc: { emailCount: 1 },
    });
  }

  // Schedule payment reminders
  await schedulePaymentReminders(freshInvoice);

  // Emit webhook event
  try {
    await addWebhookJob('invoice.sent', {
      invoiceId:      freshInvoice._id.toString(),
      invoiceNumber:  freshInvoice.invoiceNumber,
      recipientEmail: emailData.recipientEmail || freshInvoice.recipientEmail,
    }, companyId);
  } catch (e) { logger.error(`addWebhookJob failed for ${freshInvoice.invoiceNumber}: ${e.message}`); }
};

// ─── Schedule Reminders ────────────────────────────────────────────────────
const schedulePaymentReminders = async (invoice) => {
  if (!invoice.reminderEnabled || !invoice.dueDate) return;

  const dueDate = dayjs(invoice.dueDate);
  const now     = dayjs();

  const reminders = [
    { type: 'before_due_3days', date: dueDate.subtract(3, 'day') },
    { type: 'on_due_date',      date: dueDate },
    { type: 'after_due_3days',  date: dueDate.add(3, 'day') },
    { type: 'after_due_7days',  date: dueDate.add(7, 'day') },
    { type: 'after_due_14days', date: dueDate.add(14, 'day') },
    { type: 'after_due_30days', date: dueDate.add(30, 'day') },
  ];

  for (const { type, date } of reminders) {
    if (date.isAfter(now)) {
      const delay = date.diff(now, 'millisecond');
      await scheduleReminder(
        { invoiceId: invoice._id.toString(), reminderType: type, companyId: invoice.company?.toString() },
        delay
      );
    }
  }
};

// ─── Duplicate Invoice ────────────────────────────────────────────────────
const duplicate = async (invoiceId, companyId, userId) => {
  const source = await Invoice.findOne({ _id: invoiceId, company: companyId }).lean();
  if (!source) throw Object.assign(new Error('Invoice not found'), { statusCode: 404 });

  const { _id, invoiceNumber, status, createdAt, updatedAt, viewToken, pdfUrl, ...rest } = source;
  const newNumber = await reserveNextInvoiceNumber(companyId, { clientId: source.client });

  return Invoice.create({
    ...rest,
    invoiceNumber:  newNumber,
    invoiceDate:    new Date(),
    status:         'draft',
    parentInvoice:  _id,
    createdBy:      userId,
    viewToken:      uuidv4(),
    amountPaid:     0,
    balanceDue:     rest.grandTotal,
    emailCount:     0,
    reminderCount:  0,
    lastEmailSentAt: null,
  });
};

// ─── Create Credit Note ───────────────────────────────────────────────────
const createCreditNote = async (invoiceId, companyId, userId) => {
  const source = await Invoice.findOne({ _id: invoiceId, company: companyId }).lean();
  if (!source) throw Object.assign(new Error('Invoice not found'), { statusCode: 404 });

  const cnNumber = await reserveNextInvoiceNumber(companyId, { clientId: source.client });

  return Invoice.create({
    ...source,
    _id:           undefined,
    invoiceNumber: cnNumber,
    invoiceDate:   new Date(),
    status:        'draft',
    isCreditNote:  true,
    creditNoteFor: invoiceId,
    parentInvoice: undefined,
    createdBy:     userId,
    viewToken:     uuidv4(),
    amountPaid:    0,
    balanceDue:    source.grandTotal,
    emailCount:    0,
  });
};

// ─── Mark as Viewed (client opens link) ───────────────────────────────────
const markViewed = async (viewToken) => {
  return Invoice.findOneAndUpdate(
    { viewToken, status: 'sent' },
    { status: 'viewed', viewedAt: new Date(), $inc: { viewCount: 1 } },
    { new: true }
  );
};

module.exports = { create, list, getById, update, cancel, sendInvoiceEmail, duplicate, createCreditNote, markViewed, schedulePaymentReminders };
