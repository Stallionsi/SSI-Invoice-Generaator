/**
 * Invoice creation confirmation email template.
 * Sent to the company/sender immediately after a new invoice is created.
 *
 * @param {object} opts
 * @param {string} opts.invoiceNumber   Auto-generated invoice number (e.g. INV-2026-000042)
 * @param {string} opts.invoiceId       MongoDB _id (for deep-link)
 * @param {string} opts.clientName      Recipient client's display name
 * @param {number} opts.grandTotal      Final invoice amount (after tax, discount, etc.)
 * @param {string} opts.currency        Currency code (e.g. INR, USD)
 * @param {Date}   opts.invoiceDate     Invoice date
 * @param {Date}   [opts.dueDate]       Due date (optional)
 * @param {string} opts.dashboardUrl    Direct link to the invoice in the dashboard
 * @param {string} [opts.appName]       Application name
 * @returns {string} HTML string
 */
const invoiceCreatedTemplate = ({
  invoiceNumber,
  invoiceId,
  clientName,
  grandTotal,
  currency = 'INR',
  invoiceDate,
  dueDate,
  dashboardUrl,
  appName = 'Invoice Generator',
}) => {
  const fmt = (n) =>
    Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const fmtDate = (d) =>
    d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  const currencySymbol = { INR: '₹', USD: '$', EUR: '€', GBP: '£', AED: 'AED ', SGD: 'S$' }[currency] || `${currency} `;

  return /* html */`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Invoice ${invoiceNumber} Created — ${appName}</title>
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
      background: linear-gradient(135deg, #1a56db 0%, #1e40af 100%);
      padding: 36px 32px;
      text-align: center;
    }
    .header-icon { font-size: 36px; display: block; margin-bottom: 10px; }
    .header-title { font-size: 22px; font-weight: 700; color: #fff; }
    .header-sub { font-size: 13px; color: rgba(255,255,255,0.8); margin-top: 4px; }
    .body { padding: 36px 32px; }
    .intro { font-size: 15px; color: #4b5563; line-height: 1.7; margin-bottom: 28px; }
    /* Amount hero */
    .amount-box {
      background: linear-gradient(135deg, #eff6ff, #dbeafe);
      border: 1px solid #bfdbfe;
      border-radius: 10px;
      padding: 24px;
      text-align: center;
      margin-bottom: 28px;
    }
    .amount-label { font-size: 12px; font-weight: 600; color: #3b82f6; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px; }
    .amount-value { font-size: 36px; font-weight: 800; color: #1d4ed8; }
    .amount-currency { font-size: 18px; font-weight: 600; }
    /* Details table */
    .details { width: 100%; border-collapse: collapse; margin-bottom: 28px; }
    .details td { padding: 11px 14px; border-bottom: 1px solid #f3f4f6; font-size: 14px; }
    .details tr:last-child td { border-bottom: none; }
    .details .label { color: #6b7280; font-weight: 500; width: 42%; }
    .details .value { color: #111827; font-weight: 600; }
    .details .value.mono { font-family: 'SF Mono', 'Fira Code', monospace; font-size: 13px; color: #1d4ed8; }
    /* Status badge */
    .badge {
      display: inline-block;
      background: #fef3c7;
      color: #92400e;
      font-size: 11px;
      font-weight: 700;
      padding: 3px 10px;
      border-radius: 999px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    /* CTA */
    .cta-wrapper { text-align: center; margin: 8px 0 24px; }
    .cta-btn {
      display: inline-block;
      padding: 13px 32px;
      background: #1a56db;
      color: #fff !important;
      text-decoration: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
    }
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
        <span class="header-icon">📄</span>
        <div class="header-title">Invoice Created Successfully</div>
        <div class="header-sub">${appName}</div>
      </div>

      <!-- Body -->
      <div class="body">
        <p class="intro">
          A new invoice has been created for <strong>${clientName}</strong> and is ready to send.
        </p>

        <!-- Amount hero -->
        <div class="amount-box">
          <div class="amount-label">Invoice Total</div>
          <div class="amount-value">
            <span class="amount-currency">${currencySymbol}</span>${fmt(grandTotal)}
          </div>
        </div>

        <!-- Details -->
        <table class="details">
          <tr>
            <td class="label">Invoice Number</td>
            <td class="value mono">${invoiceNumber}</td>
          </tr>
          <tr>
            <td class="label">Client</td>
            <td class="value">${clientName}</td>
          </tr>
          <tr>
            <td class="label">Invoice Date</td>
            <td class="value">${fmtDate(invoiceDate)}</td>
          </tr>
          <tr>
            <td class="label">Due Date</td>
            <td class="value">${fmtDate(dueDate)}</td>
          </tr>
          <tr>
            <td class="label">Status</td>
            <td class="value"><span class="badge">Draft</span></td>
          </tr>
          <tr>
            <td class="label">Invoice ID</td>
            <td class="value mono" style="font-size:12px;color:#9ca3af">${invoiceId}</td>
          </tr>
        </table>

        <!-- CTA -->
        <div class="cta-wrapper">
          <a href="${dashboardUrl}" class="cta-btn">View Invoice →</a>
        </div>

        <p class="note">
          The invoice is currently in <strong>Draft</strong> status. Open it in the dashboard
          to review, edit, and send it to your client.
        </p>
      </div>

      <!-- Footer -->
      <div class="footer">
        <p>${appName} &bull; Automated notification &bull; Do not reply</p>
        <p style="margin-top:4px">Invoice ${invoiceNumber} was created in your account.</p>
      </div>

    </div>
  </div>
</body>
</html>`.trim();
};

module.exports = invoiceCreatedTemplate;
