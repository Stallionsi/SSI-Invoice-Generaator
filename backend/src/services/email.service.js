const nodemailer = require('nodemailer');
const crypto = require('crypto');
const path = require('path');
const fs   = require('fs');
const EmailLog = require('../models/EmailLog.model');
const Invoice = require('../models/Invoice.model');
const Company = require('../models/Company.model');
const Payment = require('../models/Payment.model');
const { USE_RESEND, SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, EMAIL_FROM_NAME, EMAIL_FROM_ADDRESS } = require('../config/env');
const { decrypt } = require('../utils/encryption.util');
const { sendViaResend } = require('../utils/resend.util');
const logger = require('../utils/logger');
const resetPasswordTemplate  = require('../templates/emails/resetPassword.template');
const welcomeTemplate        = require('../templates/emails/welcome.template');
const verifyEmailTemplate    = require('../templates/emails/verifyEmail.template');

// ─── Transport ─────────────────────────────────────────────────────────────
const createTransport = (companySmtp = null) => {
  // Company SMTP override — decrypt stored password before use
  if (companySmtp?.host) {
    return nodemailer.createTransport({
      host:   companySmtp.host,
      port:   companySmtp.port || 587,
      secure: companySmtp.port === 465,
      auth:   { user: companySmtp.user, pass: decrypt(companySmtp.pass) },
    });
  }

  return nodemailer.createTransport({
    host:   SMTP_HOST,
    port:   SMTP_PORT,
    secure: SMTP_SECURE,
    auth:   { user: SMTP_USER, pass: SMTP_PASS },
  });
};

// ─── Base Send ─────────────────────────────────────────────────────────────
/**
 * Core email dispatcher. Routes to Resend, SES, or SMTP depending on env.
 * If Resend is the active provider (USE_RESEND=true) it is used for all
 * sends EXCEPT those that supply a per-company SMTP override — those always
 * use the company's own SMTP credentials.
 */
// System email types that should carry unsubscribe headers
const SYSTEM_EMAIL_TYPES = new Set(['other', 'welcome', 'password_reset', 'payment_reminder', 'payment_receipt']);

const sendEmail = async ({ to, cc, bcc, subject, html, attachments = [], from, companySmtp, invoiceId, companyId, type, userId, headers = {} }) => {
  const fromAddr   = from || `"${EMAIL_FROM_NAME}" <${EMAIL_FROM_ADDRESS}>`;
  const toArray    = Array.isArray(to) ? to : [to];

  // Build merged headers: caller-supplied + auto-added deliverability headers
  const autoHeaders = {
    'X-Entity-Ref-ID': crypto.randomUUID(), // unique per send — prevents Gmail threading/spam collapse
  };
  if (!companySmtp?.host && SYSTEM_EMAIL_TYPES.has(type)) {
    autoHeaders['List-Unsubscribe']      = `<mailto:${EMAIL_FROM_ADDRESS}?subject=unsubscribe>`;
    autoHeaders['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
  }
  const mergedHeaders = { ...autoHeaders, ...headers };

  // Determine provider label for logging
  const provider = companySmtp?.host ? 'smtp' : USE_RESEND ? 'resend' : 'smtp';

  // Create log entry first (status: queued)
  const log = await EmailLog.create({
    company:  companyId,
    invoice:  invoiceId,
    type:     type || 'other',
    from:     fromAddr,
    to:       toArray,
    cc:       cc  || [],
    bcc:      bcc || [],
    subject,
    attachments: attachments.map((a) => a.filename || a.path),
    provider,
    status:   'queued',
    sentBy:   userId,
  });

  try {
    let providerId;

    // Company-level SMTP override always uses nodemailer regardless of USE_RESEND
    if (companySmtp?.host) {
      const transport = createTransport(companySmtp);
      const info = await transport.sendMail({
        from: fromAddr,
        to:   toArray.join(','),
        cc:   cc?.join(','),
        bcc:  bcc?.join(','),
        subject,
        html,
        attachments,
        headers: mergedHeaders,
      });
      providerId = info.messageId;
    } else if (USE_RESEND) {
      const result = await sendViaResend({ to: toArray, from: fromAddr, subject, html, cc, bcc, attachments, headers: mergedHeaders });
      providerId = result.id;
    } else {
      const transport = createTransport();
      const info = await transport.sendMail({
        from: fromAddr,
        to:   toArray.join(','),
        cc:   cc?.join(','),
        bcc:  bcc?.join(','),
        subject,
        html,
        attachments,
        headers: mergedHeaders,
      });
      providerId = info.messageId;
    }

    await EmailLog.findByIdAndUpdate(log._id, {
      status:      'sent',
      providerId,
      deliveredAt: new Date(),
    });

    logger.info(`Email sent [${provider}]: "${subject}" → ${toArray.join(', ')}`);
    return { providerId };
  } catch (err) {
    await EmailLog.findByIdAndUpdate(log._id, { status: 'failed', errorMessage: err.message });
    logger.error(`Email send failed [${provider}]: ${err.message}`);
    throw err;
  }
};

// ─── Invoice Email ─────────────────────────────────────────────────────────
/**
 * @param pdfPath  Local relative path returned by generateInvoicePdf
 *                 (e.g. "uploads/pdfs/INV-001-1234567890.pdf").
 *                 Passed explicitly so we never need to re-fetch from a CDN.
 */
const sendInvoiceEmail = async ({ invoiceId, companyId, recipientEmail, ccEmails, bccEmails, subject, message, userId, pdfPath }) => {
  const [invoice, company] = await Promise.all([
    Invoice.findById(invoiceId).populate('client', 'clientName').lean(),
    Company.findById(companyId).select('+smtpSettings.pass').lean(),
  ]);
  if (!invoice) throw new Error('Invoice not found');

  const emailSubject = subject || `Invoice ${invoice.invoiceNumber} from ${company.companyName}`;
  const html = buildInvoiceEmailHtml({ invoice, company, message });

  // ── Build PDF attachment from local file ───────────────────────────────
  const attachments = [];
  const localPath   = pdfPath || invoice.pdfUrl;   // prefer explicitly supplied path

  if (localPath && !localPath.startsWith('http')) {
    const fullPath = path.resolve(localPath);
    console.log('PDF path:', fullPath);
    try {
      const pdfBuffer = fs.readFileSync(fullPath);
      console.log('PDF buffer size:', pdfBuffer.length);

      if (pdfBuffer.length > 0) {
        attachments.push({
          filename:    `Invoice_${String(invoice.invoiceNumber).replace(/[/\\:*?"<>|\s]/g, '-')}.pdf`,
          content:     pdfBuffer,
          contentType: 'application/pdf',
        });
      } else {
        logger.warn(`[email] PDF buffer is empty for ${invoice.invoiceNumber} — skipping attachment`);
      }
    } catch (err) {
      logger.error(`[email] Could not read PDF file (${invoice.invoiceNumber}): ${err.message}`);
      // Email still sends — attachment failure must not block delivery
    }
  } else if (localPath && localPath.startsWith('http')) {
    logger.warn(`[email] pdfUrl is a remote URL for ${invoice.invoiceNumber} — PDF not attached`);
  }
  // ── ─────────────────────────────────────────────────────────────────────

  await sendEmail({
    to:          recipientEmail || invoice.recipientEmail,
    cc:          ccEmails  || invoice.ccEmails,
    bcc:         bccEmails || invoice.bccEmails,
    subject:     emailSubject,
    html,
    attachments,
    companySmtp: company.smtpSettings,
    invoiceId,
    companyId,
    type:        'invoice_send',
    userId,
  });
};

// ─── Payment Reminder ─────────────────────────────────────────────────────
const sendPaymentReminder = async ({ invoiceId, companyId, reminderType }) => {
  const [invoice, company] = await Promise.all([
    Invoice.findById(invoiceId).populate('client', 'clientName email').lean(),
    Company.findById(companyId).select('+smtpSettings.pass').lean(),
  ]);

  const SKIP = ['paid', 'cancelled'];
  if (!invoice || SKIP.includes(invoice.status)) {
    logger.info(
      `[sendPaymentReminder] Skipping ${reminderType} for invoice ${invoiceId} — ` +
      `status=${invoice?.status ?? 'not found'}`
    );
    return;
  }

  if (!invoice.recipientEmail) {
    logger.warn(
      `[sendPaymentReminder] Invoice ${invoiceId} has no recipientEmail — cannot send ${reminderType}`
    );
    return;
  }

  logger.info(
    `[sendPaymentReminder] Sending ${reminderType} for invoice ${invoiceId} ` +
    `→ ${invoice.recipientEmail} (status=${invoice.status})`
  );

  const subject = buildReminderSubject(invoice, reminderType);
  const html    = buildReminderEmailHtml({ invoice, company, reminderType });

  await sendEmail({
    to:          invoice.recipientEmail,
    subject,
    html,
    companySmtp: company?.smtpSettings,
    invoiceId,
    companyId,
    type:        'payment_reminder',
  });
};

// ─── Payment Receipt ──────────────────────────────────────────────────────
const sendPaymentReceipt = async ({ invoiceId, paymentId, companyId }) => {
  const [invoice, payment, company] = await Promise.all([
    Invoice.findById(invoiceId).lean(),
    Payment.findById(paymentId).lean(),
    Company.findById(companyId).lean(),
  ]);
  if (!invoice || !payment) return;

  const subject = `Payment Received — Invoice ${invoice.invoiceNumber}`;
  const html = buildReceiptEmailHtml({ invoice, payment, company });

  await sendEmail({
    to:          invoice.recipientEmail,
    subject,
    html,
    companySmtp: company.smtpSettings,
    invoiceId,
    companyId,
    type:        'payment_receipt',
  });
};

// ─── Currency formatter ────────────────────────────────────────────────────
const CURRENCY_SYMBOLS = { INR: '₹', USD: '$', EUR: '€', GBP: '£', AUD: 'A$', SGD: 'S$', AED: 'AED ' };
const fmtMoney = (amount, currency = 'INR') => {
  const sym    = CURRENCY_SYMBOLS[currency] || (currency + ' ');
  const locale = currency === 'INR' ? 'en-IN' : 'en-US';
  return `${sym}${(amount || 0).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

// ─── Email HTML Builders ───────────────────────────────────────────────────
const buildInvoiceEmailHtml = ({ invoice, company, message }) => `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: Arial, sans-serif; color: #333; margin: 0; padding: 0; background: #f4f4f4; }
  .container { max-width: 600px; margin: 30px auto; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
  .header { background: #1a56db; color: #fff; padding: 30px; text-align: center; }
  .header h1 { margin: 0; font-size: 24px; }
  .body { padding: 30px; }
  .info-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
  .info-table td { padding: 8px 12px; border: 1px solid #e5e7eb; }
  .info-table td:first-child { background: #f9fafb; font-weight: 600; width: 40%; }
  .amount { font-size: 28px; font-weight: 700; color: #1a56db; text-align: center; margin: 20px 0; }
  .btn { display: block; width: 200px; margin: 20px auto; padding: 12px 24px; background: #1a56db; color: #fff; text-align: center; text-decoration: none; border-radius: 6px; font-weight: 600; }
  .footer { background: #f9fafb; padding: 20px; text-align: center; font-size: 12px; color: #6b7280; }
</style></head>
<body>
<div class="container">
  <div class="header">
    <h1>${company.companyName}</h1>
    <p style="margin:5px 0;opacity:0.9">Invoice Attached</p>
  </div>
  <div class="body">
    <p>Dear ${invoice.recipientDetails?.name || 'Valued Client'},</p>
    ${message ? `<p>${message}</p>` : `<p>Please find attached your invoice from <strong>${company.companyName}</strong>.</p>`}
    <table class="info-table">
      <tr><td>Invoice Number</td><td><strong>${invoice.invoiceNumber}</strong></td></tr>
      <tr><td>Invoice Date</td><td>${new Date(invoice.invoiceDate).toLocaleDateString('en-IN')}</td></tr>
      <tr><td>Due Date</td><td>${invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString('en-IN') : 'On Receipt'}</td></tr>
      <tr><td>Amount Due</td><td><strong>${fmtMoney(invoice.grandTotal, invoice.currency)}</strong></td></tr>
    </table>
    <div class="amount">${fmtMoney(invoice.balanceDue, invoice.currency)}</div>
    <p style="text-align:center;color:#6b7280;font-size:13px">Balance Due</p>
    <p>Please review the attached PDF for complete invoice details.</p>
    ${invoice.notes ? `<p><em>${invoice.notes}</em></p>` : ''}
  </div>
  <div class="footer">
    <p>${company.companyName} | ${company.email || ''} | ${company.phone || ''}</p>
    ${company.gstNumber ? `<p>GSTIN: ${company.gstNumber}</p>` : ''}
  </div>
</div>
</body></html>`;

// ─── Reminder milestone metadata ──────────────────────────────────────────
const REMINDER_META = {
  before_due_3days: {
    headerColor: '#1d4ed8',
    badgeBg:     '#dbeafe',
    badgeColor:  '#1e40af',
    headline:    'Payment Due in 3 Days',
    badge:       'Due in 3 days',
    bodyLine:    (inv) => `Invoice <strong>${inv.invoiceNumber}</strong> is due in <strong>3 days</strong>. Please arrange payment to avoid any delays.`,
  },
  on_due_date: {
    headerColor: '#0369a1',
    badgeBg:     '#e0f2fe',
    badgeColor:  '#0c4a6e',
    headline:    'Payment Due Today',
    badge:       'Due Today',
    bodyLine:    (inv) => `Invoice <strong>${inv.invoiceNumber}</strong> is <strong>due today</strong>. Kindly process payment at your earliest convenience.`,
  },
  after_due_3days: {
    headerColor: '#b45309',
    badgeBg:     '#fef3c7',
    badgeColor:  '#92400e',
    headline:    'Invoice 3 Days Overdue',
    badge:       '3 days overdue',
    bodyLine:    (inv) => `Invoice <strong>${inv.invoiceNumber}</strong> is now <strong>3 days overdue</strong>. Please settle the outstanding balance as soon as possible.`,
  },
  after_due_7days: {
    headerColor: '#c2410c',
    badgeBg:     '#ffedd5',
    badgeColor:  '#9a3412',
    headline:    'Invoice 7 Days Overdue',
    badge:       '7 days overdue',
    bodyLine:    (inv) => `Invoice <strong>${inv.invoiceNumber}</strong> remains unpaid and is <strong>7 days overdue</strong>. Please make payment immediately to avoid further follow-up.`,
  },
  after_due_14days: {
    headerColor: '#dc2626',
    badgeBg:     '#fee2e2',
    badgeColor:  '#991b1b',
    headline:    'Invoice 14 Days Overdue',
    badge:       '14 days overdue',
    bodyLine:    (inv) => `Invoice <strong>${inv.invoiceNumber}</strong> is <strong>14 days overdue</strong>. This is an urgent request to settle your outstanding balance immediately.`,
  },
  after_due_30days: {
    headerColor: '#7f1d1d',
    badgeBg:     '#fecaca',
    badgeColor:  '#7f1d1d',
    headline:    'Final Notice — 30 Days Overdue',
    badge:       '30 days overdue',
    bodyLine:    (inv) => `Invoice <strong>${inv.invoiceNumber}</strong> is <strong>30 days overdue</strong>. This is a final notice. Please contact us immediately to resolve this matter.`,
  },
};

const buildReminderSubject = (invoice, reminderType) => {
  const subjects = {
    before_due_3days: `Payment Due in 3 Days — Invoice ${invoice.invoiceNumber}`,
    on_due_date:      `Invoice ${invoice.invoiceNumber} — Payment Due Today`,
    after_due_3days:  `Overdue Notice — Invoice ${invoice.invoiceNumber} (3 days past due)`,
    after_due_7days:  `Payment Overdue — Invoice ${invoice.invoiceNumber} (7 days)`,
    after_due_14days: `Urgent: Invoice ${invoice.invoiceNumber} Still Unpaid (14 days overdue)`,
    after_due_30days: `Final Notice: Invoice ${invoice.invoiceNumber} — 30 Days Overdue`,
  };
  return subjects[reminderType]
    || `Payment Reminder — Invoice ${invoice.invoiceNumber} — ${fmtMoney(invoice.balanceDue, invoice.currency)}`;
};

const buildReminderEmailHtml = ({ invoice, company, reminderType }) => {
  const meta = REMINDER_META[reminderType] || REMINDER_META.after_due_3days;
  const clientName  = invoice.recipientDetails?.name || 'Valued Client';
  const companyName = company?.companyName || invoice.senderDetails?.name || '';
  const dueDateStr  = invoice.dueDate
    ? new Date(invoice.dueDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : 'N/A';

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#1f2937}
  .wrap{max-width:600px;margin:32px auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.10)}
  .hdr{background:${meta.headerColor};color:#fff;padding:32px 36px;text-align:center}
  .hdr h1{margin:0 0 6px;font-size:22px;font-weight:700;letter-spacing:-.3px}
  .hdr p{margin:0;opacity:.88;font-size:14px}
  .badge{display:inline-block;margin:0 auto 4px;padding:4px 14px;border-radius:20px;background:${meta.badgeBg};color:${meta.badgeColor};font-size:12px;font-weight:700;letter-spacing:.3px;text-transform:uppercase}
  .body{padding:32px 36px}
  .amount-box{background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;text-align:center;padding:20px;margin:20px 0}
  .amount-box .label{font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px}
  .amount-box .value{font-size:34px;font-weight:700;color:${meta.headerColor}}
  table.details{width:100%;border-collapse:collapse;margin:20px 0}
  table.details td{padding:9px 12px;font-size:14px;border:1px solid #e5e7eb}
  table.details td:first-child{background:#f9fafb;font-weight:600;width:38%;color:#374151}
  .footer{background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 36px;text-align:center;font-size:12px;color:#6b7280;line-height:1.8}
</style>
</head>
<body>
<div class="wrap">
  <div class="hdr">
    <div class="badge">${meta.badge}</div>
    <h1>${meta.headline}</h1>
    <p>${companyName}</p>
  </div>
  <div class="body">
    <p style="font-size:15px">Dear ${clientName},</p>
    <p style="font-size:14px;line-height:1.6">${meta.bodyLine(invoice)}</p>

    <div class="amount-box">
      <div class="label">Balance Due</div>
      <div class="value">${fmtMoney(invoice.balanceDue, invoice.currency)}</div>
    </div>

    <table class="details">
      <tr><td>Invoice Number</td><td><strong>${invoice.invoiceNumber}</strong></td></tr>
      <tr><td>Invoice Date</td><td>${new Date(invoice.invoiceDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td></tr>
      <tr><td>Due Date</td><td><strong>${dueDateStr}</strong></td></tr>
      <tr><td>Amount Due</td><td><strong>${fmtMoney(invoice.balanceDue, invoice.currency)}</strong></td></tr>
    </table>

    <p style="font-size:13px;color:#6b7280">If you have already made the payment, please disregard this notice. For any queries, reply to this email or contact ${companyName} directly.</p>
  </div>
  <div class="footer">
    <p><strong>${companyName}</strong>${company?.email ? ' &bull; ' + company.email : ''}${company?.phone ? ' &bull; ' + company.phone : ''}</p>
    ${company?.gstNumber ? `<p>GSTIN: ${company.gstNumber}</p>` : ''}
    <p>This is an automated payment reminder. Please do not reply to this email.</p>
  </div>
</div>
</body></html>`;
};

const buildReceiptEmailHtml = ({ invoice, payment, company }) => `
<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  body { font-family: Arial, sans-serif; color: #333; background: #f4f4f4; }
  .container { max-width: 600px; margin: 30px auto; background: #fff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
  .header { background: #059669; color: #fff; padding: 30px; text-align: center; }
  .body { padding: 30px; }
  .info-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
  .info-table td { padding: 8px 12px; border: 1px solid #e5e7eb; }
  .info-table td:first-child { background: #f9fafb; font-weight: 600; width: 40%; }
  .footer { background: #f9fafb; padding: 20px; text-align: center; font-size: 12px; color: #6b7280; }
</style></head>
<body><div class="container">
  <div class="header"><h1>Payment Received</h1><p style="opacity:0.9">${company.companyName}</p></div>
  <div class="body">
    <p>Thank you! We have received your payment.</p>
    <table class="info-table">
      <tr><td>Invoice Number</td><td>${invoice.invoiceNumber}</td></tr>
      <tr><td>Payment Amount</td><td><strong>${fmtMoney(payment.paymentAmount, invoice.currency)}</strong></td></tr>
      <tr><td>Payment Date</td><td>${new Date(payment.paymentDate).toLocaleDateString('en-IN')}</td></tr>
      <tr><td>Payment Method</td><td>${payment.paymentMethod?.replace('_', ' ')?.toUpperCase()}</td></tr>
      ${payment.transactionId ? `<tr><td>Transaction ID</td><td>${payment.transactionId}</td></tr>` : ''}
      <tr><td>Balance Due</td><td>${invoice.balanceDue <= 0.01 ? '<strong style="color:#059669">FULLY PAID</strong>' : fmtMoney(invoice.balanceDue, invoice.currency)}</td></tr>
    </table>
  </div>
  <div class="footer">
    <p>${company.companyName}${company.email ? ' &bull; ' + company.email : ''}</p>
    <p>This is an automated payment confirmation. Please do not reply to this email.</p>
  </div>
</div></body></html>`;

// ─── Verification Email ───────────────────────────────────────────────────
const sendVerificationEmail = async ({ to, name, verifyUrl, appName }) => {
  const html    = verifyEmailTemplate({ name, verifyUrl, appName: appName || EMAIL_FROM_NAME });
  const subject = `Verify your email — ${appName || EMAIL_FROM_NAME}`;
  await sendEmail({ to, subject, html, type: 'other' });
  logger.info(`Verification email dispatched to: ${to}`);
};

// ─── Welcome Email ────────────────────────────────────────────────────────
const sendWelcomeEmail = async ({ to, name, loginUrl, appName }) => {
  const html    = welcomeTemplate({ name, email: to, loginUrl, appName: appName || EMAIL_FROM_NAME });
  const subject = `Welcome to ${appName || EMAIL_FROM_NAME}`;
  await sendEmail({ to, subject, html, type: 'welcome' });
  logger.info(`Welcome email dispatched to: ${to}`);
};

// ─── Password Reset Email ──────────────────────────────────────────────────
/**
 * Sends a password reset link. Uses Resend when USE_RESEND=true,
 * otherwise falls through to SMTP/SES via the central sendEmail dispatcher.
 */
const sendPasswordResetEmail = async ({ to, resetUrl, name }) => {
  const fromAddr = `"${EMAIL_FROM_NAME}" <${EMAIL_FROM_ADDRESS}>`;
  const html     = resetPasswordTemplate({ resetUrl, name, appName: EMAIL_FROM_NAME });
  const subject  = `Reset your ${EMAIL_FROM_NAME} password`;

  await sendEmail({ to, from: fromAddr, subject, html, type: 'password_reset' });
  logger.info(`Password reset email dispatched to: ${to}`);
};

module.exports = {
  sendEmail,
  sendInvoiceEmail,
  sendPaymentReminder,
  sendPaymentReceipt,
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendVerificationEmail,
};
