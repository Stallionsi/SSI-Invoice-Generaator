/**
 * Welcome email template.
 * Sent once immediately after a user registers an account.
 *
 * @param {object} opts
 * @param {string} opts.name        User's display name
 * @param {string} opts.email       User's email address
 * @param {string} opts.loginUrl    Direct link to the login page
 * @param {string} opts.appName     Application name (defaults to "Invoice Generator")
 * @returns {string} HTML string ready to send
 */
const welcomeTemplate = ({ name, email, loginUrl, appName = 'Invoice Generator' }) => /* html */`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Welcome to ${appName}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background-color: #f3f4f6;
      color: #111827;
      padding: 32px 16px;
    }
    .wrapper { max-width: 600px; margin: 0 auto; }
    .card {
      background: #ffffff;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 24px rgba(0,0,0,0.08);
    }
    .header {
      background: linear-gradient(135deg, #1a56db 0%, #1e40af 100%);
      padding: 40px 32px;
      text-align: center;
    }
    .header-logo {
      font-size: 28px;
      font-weight: 800;
      color: #ffffff;
      letter-spacing: -0.5px;
    }
    .header-tagline {
      margin-top: 6px;
      font-size: 14px;
      color: rgba(255,255,255,0.8);
    }
    .body { padding: 40px 32px; }
    .greeting {
      font-size: 22px;
      font-weight: 700;
      color: #111827;
      margin-bottom: 16px;
    }
    .text {
      font-size: 15px;
      line-height: 1.7;
      color: #4b5563;
      margin-bottom: 16px;
    }
    .feature-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin: 28px 0;
    }
    .feature-item {
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 16px;
    }
    .feature-icon { font-size: 22px; margin-bottom: 6px; }
    .feature-title {
      font-size: 13px;
      font-weight: 600;
      color: #111827;
    }
    .feature-desc {
      font-size: 12px;
      color: #6b7280;
      margin-top: 2px;
    }
    .cta-wrapper { text-align: center; margin: 32px 0; }
    .cta-btn {
      display: inline-block;
      padding: 14px 36px;
      background: #1a56db;
      color: #ffffff !important;
      text-decoration: none;
      border-radius: 8px;
      font-size: 15px;
      font-weight: 600;
      letter-spacing: 0.2px;
    }
    .divider {
      border: none;
      border-top: 1px solid #e5e7eb;
      margin: 28px 0;
    }
    .meta {
      font-size: 13px;
      color: #9ca3af;
      line-height: 1.6;
    }
    .meta strong { color: #6b7280; }
    .footer {
      background: #f9fafb;
      border-top: 1px solid #e5e7eb;
      padding: 24px 32px;
      text-align: center;
      font-size: 12px;
      color: #9ca3af;
      line-height: 1.8;
    }
    .footer a { color: #6b7280; text-decoration: underline; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">

      <!-- Header -->
      <div class="header">
        <div class="header-logo">${appName}</div>
        <div class="header-tagline">Professional Invoicing Made Simple</div>
      </div>

      <!-- Body -->
      <div class="body">
        <p class="greeting">Welcome, ${name}</p>

        <p class="text">
          Your account has been created successfully. You're now part of
          <strong>${appName}</strong> — a complete invoicing platform to manage
          your clients, invoices, payments, and reports all in one place.
        </p>

        <!-- Feature highlights -->
        <div class="feature-grid">
          <div class="feature-item">
            <div class="feature-title">Smart Invoices</div>
            <div class="feature-desc">GST-compliant with auto-numbering</div>
          </div>
          <div class="feature-item">
            <div class="feature-title">Client Management</div>
            <div class="feature-desc">Store and organize all your clients</div>
          </div>
          <div class="feature-item">
            <div class="feature-title">Payment Tracking</div>
            <div class="feature-desc">Record and monitor every payment</div>
          </div>
          <div class="feature-item">
            <div class="feature-title">Reports</div>
            <div class="feature-desc">Revenue, aging, and GST reports</div>
          </div>
        </div>

        <div class="cta-wrapper">
          <a href="${loginUrl}" class="cta-btn">Go to Dashboard →</a>
        </div>

        <hr class="divider" />

        <p class="meta">
          <strong>Account email:</strong> ${email}<br />
          If you did not create this account, please ignore this email or
          contact support immediately.
        </p>
      </div>

      <!-- Footer -->
      <div class="footer">
        <p>${appName} &bull; Automated system email &bull; Do not reply</p>
        <p style="margin-top:4px">
          You're receiving this because an account was registered with this address.
        </p>
      </div>

    </div>
  </div>
</body>
</html>
`.trim();

module.exports = welcomeTemplate;
