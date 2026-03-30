/**
 * Overdue Payment Reminder email template.
 * Sent to the client when their invoice is more than 1 day past due.
 *
 * @param {object} opts
 * @param {string} opts.clientName     Recipient client display name
 * @param {string} opts.invoiceNumber  Invoice number (e.g. INV-2026-000042)
 * @param {Date}   opts.dueDate        Invoice due date
 * @param {number} opts.balanceDue     Remaining amount due
 * @param {string} opts.currency       Currency code (INR / USD / etc.)
 * @param {number} opts.daysOverdue    How many days past due
 * @param {string} [opts.companyName]  Sender company name
 * @param {string} [opts.appName]      Application name
 * @returns {string} HTML string
 */
const overdueReminderTemplate = ({
  clientName,
  invoiceNumber,
  dueDate,
  balanceDue,
  currency = 'INR',
  daysOverdue,
  companyName = 'Your Service Provider',
  appName = 'Invoice Generator',
}) => {
  const fmt = (n) =>
    Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const fmtDate = (d) =>
    d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  const currencySymbol = { INR: 'Rs. ', USD: '$', EUR: 'EUR ', GBP: 'GBP ', AED: 'AED ', SGD: 'S$' }[currency] || `${currency} `;

  return /* html */`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Payment Overdue — ${invoiceNumber}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: #f3f4f6;
      color: #111827;
      padding: 32px 16px;
    }
    .wrapper { max-width: 600px; margin: 0 auto; }
    .card {
      background: #fff;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 24px rgba(0,0,0,0.08);
    }
    .header {
      background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);
      padding: 36px 32px;
      text-align: center;
    }
    .header-icon { font-size: 36px; display: block; margin-bottom: 10px; }
    .header-title { font-size: 22px; font-weight: 700; color: #fff; }
    .header-sub { font-size: 13px; color: rgba(255,255,255,0.8); margin-top: 4px; }
    .body { padding: 36px 32px; }
    .intro { font-size: 15px; color: #4b5563; line-height: 1.7; margin-bottom: 28px; }
    .amount-box {
      background: linear-gradient(135deg, #fff1f2, #fee2e2);
      border: 1px solid #fecaca;
      border-radius: 10px;
      padding: 24px;
      text-align: center;
      margin-bottom: 28px;
    }
    .amount-label { font-size: 12px; font-weight: 600; color: #dc2626; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px; }
    .amount-value { font-size: 36px; font-weight: 800; color: #991b1b; }
    .amount-currency { font-size: 18px; font-weight: 600; }
    .overdue-badge {
      display: inline-block;
      background: #fee2e2;
      color: #991b1b;
      font-size: 12px;
      font-weight: 700;
      padding: 4px 12px;
      border-radius: 999px;
      margin-top: 8px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .details { width: 100%; border-collapse: collapse; margin-bottom: 28px; }
    .details td { padding: 11px 14px; border-bottom: 1px solid #f3f4f6; font-size: 14px; }
    .details tr:last-child td { border-bottom: none; }
    .details .label { color: #6b7280; font-weight: 500; width: 42%; }
    .details .value { color: #111827; font-weight: 600; }
    .details .value.mono { font-family: 'SF Mono', 'Fira Code', monospace; font-size: 13px; color: #dc2626; }
    .note { font-size: 13px; color: #9ca3af; line-height: 1.6; }
    .footer {
      background: #f9fafb;
      border-top: 1px solid #e5e7eb;
      padding: 20px 32px;
      text-align: center;
      font-size: 12px;
      color: #9ca3af;
      line-height: 1.8;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">

      <!-- Header -->
      <div class="header">
        <span class="header-icon">⚠️</span>
        <div class="header-title">Payment Overdue</div>
        <div class="header-sub">${companyName}</div>
      </div>

      <!-- Body -->
      <div class="body">
        <p class="intro">
          Dear <strong>${clientName}</strong>,<br /><br />
          This is a friendly reminder that the payment for invoice
          <strong>${invoiceNumber}</strong> is now overdue by
          <strong>${daysOverdue} day${daysOverdue !== 1 ? 's' : ''}</strong>.
          Please arrange the payment at your earliest convenience to avoid any disruption to services.
        </p>

        <!-- Amount hero -->
        <div class="amount-box">
          <div class="amount-label">Amount Due</div>
          <div class="amount-value">
            <span class="amount-currency">${currencySymbol}</span>${fmt(balanceDue)}
          </div>
          <div class="overdue-badge">${daysOverdue} Day${daysOverdue !== 1 ? 's' : ''} Overdue</div>
        </div>

        <!-- Details -->
        <table class="details">
          <tr>
            <td class="label">Invoice Number</td>
            <td class="value mono">${invoiceNumber}</td>
          </tr>
          <tr>
            <td class="label">Due Date</td>
            <td class="value" style="color:#dc2626">${fmtDate(dueDate)}</td>
          </tr>
          <tr>
            <td class="label">Balance Due</td>
            <td class="value" style="color:#991b1b">${currencySymbol}${fmt(balanceDue)}</td>
          </tr>
        </table>

        <p class="note">
          If you have already made this payment, please disregard this message.
          For any queries, please reply to this email or contact <strong>${companyName}</strong> directly.
        </p>
      </div>

      <!-- Footer -->
      <div class="footer">
        <p>${appName} &bull; Automated reminder &bull; Do not reply</p>
        <p style="margin-top:4px">Invoice ${invoiceNumber} — overdue reminder sent automatically.</p>
      </div>

    </div>
  </div>
</body>
</html>`.trim();
};

module.exports = overdueReminderTemplate;
