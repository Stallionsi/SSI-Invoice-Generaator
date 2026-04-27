const nodemailer = require('nodemailer');
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
const resetPasswordTemplate = require('../templates/emails/resetPassword.template');
const welcomeTemplate       = require('../templates/emails/welcome.template');

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
const sendEmail = async ({ to, cc, bcc, subject, html, attachments = [], from, companySmtp, invoiceId, companyId, type, userId }) => {
  const fromAddr   = from || `"${EMAIL_FROM_NAME}" <${EMAIL_FROM_ADDRESS}>`;
  const toArray    = Array.isArray(to) ? to : [to];

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
      });
      providerId = info.messageId;
    } else if (USE_RESEND) {
      const result = await sendViaResend({ to: toArray, from: fromAddr, subject, html, cc, bcc, attachments });
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
          filename:    `invoice-${invoice.invoiceNumber}.pdf`,
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
  if (!invoice || ['paid', 'cancelled'].includes(invoice.status)) return;

  const subject = `Reminder: Invoice ${invoice.invoiceNumber} — Balance Due ₹${invoice.balanceDue}`;
  const html = buildReminderEmailHtml({ invoice, company, reminderType });

  await sendEmail({
    to:          invoice.recipientEmail,
    subject,
    html,
    companySmtp: company.smtpSettings,
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
      <tr><td>Amount Due</td><td><strong>₹${invoice.grandTotal?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></td></tr>
    </table>
    <div class="amount">₹${invoice.balanceDue?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
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

const buildReminderEmailHtml = ({ invoice, company, reminderType }) => {
  const isOverdue = ['after_due_3days', 'after_due_7days', 'after_due_14days', 'after_due_30days'].includes(reminderType);
  return `
<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  body { font-family: Arial, sans-serif; color: #333; background: #f4f4f4; }
  .container { max-width: 600px; margin: 30px auto; background: #fff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
  .header { background: ${isOverdue ? '#dc2626' : '#f59e0b'}; color: #fff; padding: 30px; text-align: center; }
  .body { padding: 30px; }
  .amount { font-size: 32px; font-weight: 700; color: ${isOverdue ? '#dc2626' : '#f59e0b'}; text-align: center; margin: 20px 0; }
  .footer { background: #f9fafb; padding: 20px; text-align: center; font-size: 12px; color: #6b7280; }
</style></head>
<body><div class="container">
  <div class="header">
    <h1>${isOverdue ? '⚠️ Overdue Invoice' : '🔔 Payment Reminder'}</h1>
    <p style="opacity:0.9">${company.companyName}</p>
  </div>
  <div class="body">
    <p>Dear ${invoice.recipientDetails?.name || 'Valued Client'},</p>
    <p>${isOverdue
      ? `This is a reminder that Invoice <strong>${invoice.invoiceNumber}</strong> is <strong>overdue</strong>.`
      : `This is a friendly reminder that Invoice <strong>${invoice.invoiceNumber}</strong> is due soon.`}
    </p>
    <p><strong>Invoice:</strong> ${invoice.invoiceNumber}<br>
       <strong>Due Date:</strong> ${new Date(invoice.dueDate).toLocaleDateString('en-IN')}<br>
       <strong>Amount Due:</strong> ₹${invoice.balanceDue?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
    <div class="amount">₹${invoice.balanceDue?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
    <p>Please make the payment at your earliest convenience.</p>
  </div>
  <div class="footer"><p>${company.companyName} | ${company.email || ''}</p></div>
</div></body></html>`;
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
  <div class="header"><h1>✅ Payment Received</h1><p style="opacity:0.9">${company.companyName}</p></div>
  <div class="body">
    <p>Thank you! We have received your payment.</p>
    <table class="info-table">
      <tr><td>Invoice Number</td><td>${invoice.invoiceNumber}</td></tr>
      <tr><td>Payment Amount</td><td><strong>₹${payment.paymentAmount?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></td></tr>
      <tr><td>Payment Date</td><td>${new Date(payment.paymentDate).toLocaleDateString('en-IN')}</td></tr>
      <tr><td>Payment Method</td><td>${payment.paymentMethod?.replace('_', ' ')?.toUpperCase()}</td></tr>
      ${payment.transactionId ? `<tr><td>Transaction ID</td><td>${payment.transactionId}</td></tr>` : ''}
      <tr><td>Balance Due</td><td>${invoice.balanceDue <= 0.01 ? '<strong style="color:#059669">FULLY PAID</strong>' : `₹${invoice.balanceDue?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}</td></tr>
    </table>
  </div>
  <div class="footer"><p>${company.companyName} | ${company.email || ''}</p></div>
</div></body></html>`;

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
};
