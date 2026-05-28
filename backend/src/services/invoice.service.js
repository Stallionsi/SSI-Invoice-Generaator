const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');
const Invoice = require('../models/Invoice.model');
const Client = require('../models/Client.model');
const Company = require('../models/Company.model');
const { generateInvoicePdf } = require('./pdf.service');
const { calculateLineItem, calculateInvoiceTotals, calculateDueDate } = require('../utils/calculation.util');
const { reserveNextInvoiceNumber } = require('../utils/invoiceNumber.util');
const { parsePagination, buildPaginationMeta, parseInvoiceFilters } = require('../utils/pagination.util');
const { addPdfJob, scheduleReminder, cancelAllReminders, addWebhookJob } = require('../config/queue');
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

  // Store globalUnitPrice as a reference value (used by PDF / display).
  // Each item already has its own unitPrice set by the frontend (individual override
  // or bulk-synced from global). We pass null here so calculateLineItem always
  // uses item.unitPrice — never a blanket override that would wipe per-item prices.
  const globalUnitPrice = data.globalUnitPrice != null ? parseFloat(data.globalUnitPrice) : null;

  // Calculate line items (currency-aware: non-INR uses generic tax, not CGST/SGST)
  const lineItems = data.lineItems.map((item) =>
    calculateLineItem(item, gstType, invoiceCurrency, null)   // null = use item.unitPrice
  );

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
    // Atomic per-client, per-series sequence — safe under concurrent invoice creation.
    invoiceNumber = await reserveNextInvoiceNumber(companyId, {
      clientId: client._id,
      seriesId: data.seriesId || null,
    });
  }

  // Unique view token for client-facing link
  const viewToken = uuidv4();

  const invoiceData = {
    company:    companyId,
    client:     client._id,
    createdBy:  userId,
    series:     data.seriesId || null,
    invoiceNumber,
    invoiceDate,
    dueDate,
    paymentTerms:         data.paymentTerms || company.invoiceSettings?.defaultPaymentTerms,
    purchaseOrderNumber:  data.purchaseOrderNumber,
    poDate:               data.poDate || null,
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
    globalUnitPrice:    globalUnitPrice,
    template:           data.template || 'default',
    reminderEnabled:    data.reminderEnabled !== false,
    isRecurring:        data.isRecurring || false,
    recurringSettings:  data.recurringSettings,
    additionalCharges:  data.additionalCharges || [],
    project:            data.project,
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

  // Schedule reminders immediately on creation — fires regardless of status so
  // even draft invoices get reminders once their dueDate arrives.
  try { await schedulePaymentReminders(invoice); }
  catch (e) { logger.error(`schedulePaymentReminders failed for ${invoice.invoiceNumber}: ${e.message}`); }

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
    .populate('client',  'clientName companyName email phone billingAddress gstNumber')
    .populate('series',  'prefix description isDefault')
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

  // Snapshot fields that affect reminder scheduling before mutating
  const prevDueDate        = invoice.dueDate?.toISOString();
  const prevReminderEnabled = invoice.reminderEnabled;

  // Recalculate if line items are provided
  if (data.lineItems) {
    const currency  = data.currency || invoice.currency || DEFAULT_CURRENCY;
    const gstType   = currency === 'INR'
      ? (data.gstType || invoice.gstType || 'intrastate')
      : 'none';
    // Store the reference value but pass null to calculateLineItem so each
    // item's own unitPrice is used (supports per-item price overrides).
    const globalUnitPrice = data.globalUnitPrice != null
      ? parseFloat(data.globalUnitPrice)
      : (invoice.globalUnitPrice != null ? invoice.globalUnitPrice : null);
    const lineItems = data.lineItems.map((item) => calculateLineItem(item, gstType, currency, null));
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

  // Reschedule reminders when dueDate changed or reminders re-enabled on a sent invoice
  const newDueDate         = invoice.dueDate?.toISOString();
  const reminderNowEnabled = invoice.reminderEnabled;
  const dueDateChanged     = data.dueDate !== undefined && newDueDate !== prevDueDate;
  const reminderTurnedOff  = prevReminderEnabled && !reminderNowEnabled;
  const reminderTurnedOn   = !prevReminderEnabled && reminderNowEnabled;

  // Statuses that are still "in flight" and should receive reminders.
  // 'overdue' is included because the pre-save hook promotes 'sent' → 'overdue'
  // the moment dueDate passes — we must still reschedule when dueDate changes.
  const REMINDER_ACTIVE_STATUSES = ['sent', 'viewed', 'overdue', 'partial'];

  if (reminderTurnedOff) {
    await cancelAllReminders(invoice._id.toString());
  } else if (
    (dueDateChanged || reminderTurnedOn) &&
    REMINDER_ACTIVE_STATUSES.includes(invoice.status) &&
    invoice.reminderEnabled
  ) {
    logger.info(
      `[invoice.update] Rescheduling reminders for ${invoice._id} — ` +
      `dueDateChanged=${dueDateChanged} reminderTurnedOn=${reminderTurnedOn} status=${invoice.status}`
    );
    await cancelAllReminders(invoice._id.toString());
    await schedulePaymentReminders(invoice);
  }

  return invoice;
};

// ─── Cancel Invoice ────────────────────────────────────────────────────────
const cancel = async (invoiceId, companyId) => {
  const invoice = await Invoice.findOneAndDelete({ _id: invoiceId, company: companyId });
  if (!invoice) throw Object.assign(new Error('Invoice not found'), { statusCode: 404 });

  // Tear down any delayed BullMQ reminder jobs so they don't fire on a deleted invoice
  try { await cancelAllReminders(invoiceId.toString()); } catch { /* non-fatal */ }

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

  // Refetch after the status update so schedulePaymentReminders sees the correct
  // 'sent' status — freshInvoice was fetched before the update above.
  const invoiceForReminders = await Invoice.findById(invoiceId).lean();

  // Cancel any existing reminder jobs before scheduling fresh ones.
  // Without this, BullMQ's jobId dedup silently blocks rescheduling on resend.
  await cancelAllReminders(invoiceId.toString());

  // Schedule payment reminders
  await schedulePaymentReminders(invoiceForReminders);

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
// Catch-up window: milestones up to 36 h in the past are queued immediately.
// Milestones older than that are left to the daily cron safety-net sweep.
const REMINDER_CATCHUP_MS = 36 * 60 * 60 * 1000; // 36 h

const schedulePaymentReminders = async (invoice) => {
  if (!invoice.reminderEnabled || !invoice.dueDate) {
    logger.info(
      `[schedulePaymentReminders] Skipped invoice ${invoice._id} — ` +
      `reminderEnabled=${invoice.reminderEnabled} dueDate=${invoice.dueDate}`
    );
    return;
  }

  const invoiceId = invoice._id.toString();
  const companyId = invoice.company?.toString?.() ?? invoice.company;
  const dueDate   = dayjs(invoice.dueDate);
  const now       = dayjs();

  const milestones = [
    { type: 'before_due_3days', date: dueDate.subtract(3, 'day') },
    { type: 'on_due_date',      date: dueDate },
    { type: 'after_due_3days',  date: dueDate.add(3, 'day') },
    { type: 'after_due_7days',  date: dueDate.add(7, 'day') },
    { type: 'after_due_14days', date: dueDate.add(14, 'day') },
    { type: 'after_due_30days', date: dueDate.add(30, 'day') },
  ];

  logger.info(
    `[schedulePaymentReminders] Invoice ${invoiceId} — dueDate=${invoice.dueDate}, ` +
    `evaluating ${milestones.length} milestones`
  );

  for (const { type, date } of milestones) {
    const diffMs = date.diff(now, 'millisecond');

    if (diffMs > 0) {
      // Future milestone — delayed job
      const delaySec = Math.round(diffMs / 1000);
      logger.info(`[schedulePaymentReminders]   ${type}: future in ${delaySec}s — scheduling delayed job`);
      await scheduleReminder({ invoiceId, reminderType: type, companyId }, diffMs);

    } else if (diffMs >= -REMINDER_CATCHUP_MS) {
      // Recent past (within 36 h) — queue immediately so the worker fires now
      const agoMin = Math.round(-diffMs / 60_000);
      logger.info(`[schedulePaymentReminders]   ${type}: ${agoMin}m in the past (within catch-up window) — scheduling immediately`);
      await scheduleReminder({ invoiceId, reminderType: type, companyId }, 0);

    } else {
      // Older than 36 h — let the daily cron handle it if it hasn't already
      const agoH = Math.round(-diffMs / 3_600_000);
      logger.info(`[schedulePaymentReminders]   ${type}: ${agoH}h in the past — too old for immediate catch-up, cron will handle`);
    }
  }
};

// ─── Mark as Sent (no email) ──────────────────────────────────────────────
// Transitions a draft invoice to 'sent' without sending an email.
// Useful when the invoice was delivered outside the app (WhatsApp, PDF, etc.)
// and you just want the reminder system to activate.
const markAsSent = async (invoiceId, companyId) => {
  const invoice = await Invoice.findOneAndUpdate(
    { _id: invoiceId, company: companyId, status: 'draft' },
    { status: 'sent', isSent: true },
    { new: true }
  );
  if (!invoice) {
    // Either not found OR already non-draft (idempotent — not an error)
    const existing = await Invoice.findOne({ _id: invoiceId, company: companyId }).lean();
    if (!existing) throw Object.assign(new Error('Invoice not found'), { statusCode: 404 });
    // Already sent/overdue/etc. — schedule reminders anyway in case they were never set up
    await cancelAllReminders(invoiceId.toString());
    await schedulePaymentReminders(existing);
    return existing;
  }

  // Fresh send — cancel any stale jobs then schedule
  await cancelAllReminders(invoiceId.toString());
  await schedulePaymentReminders(invoice);
  return invoice;
};

// Reverses markAsSent: sent/overdue → draft, clears isSent flag.
// Not allowed for paid/partial/cancelled (payments already recorded).
const markAsUnsent = async (invoiceId, companyId) => {
  const invoice = await Invoice.findOneAndUpdate(
    { _id: invoiceId, company: companyId, status: { $in: ['sent', 'overdue'] } },
    { status: 'draft', isSent: false },
    { new: true }
  );
  if (!invoice) {
    const existing = await Invoice.findOne({ _id: invoiceId, company: companyId }).lean();
    if (!existing) throw Object.assign(new Error('Invoice not found'), { statusCode: 404 });
    // Already draft / paid / cancelled — return as-is (idempotent)
    return existing;
  }
  // Cancel scheduled reminders since it's back to draft
  await cancelAllReminders(invoiceId.toString());
  return invoice;
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

module.exports = { create, list, getById, update, cancel, sendInvoiceEmail, markAsSent, markAsUnsent, duplicate, createCreditNote, markViewed, schedulePaymentReminders };
