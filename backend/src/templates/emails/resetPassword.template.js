/**
 * Password reset email template.
 * Sent when a user requests a password reset via /forgot-password.
 *
 * @param {object} opts
 * @param {string} opts.resetUrl    Full URL containing the reset token
 * @param {string} [opts.name]      User's display name (optional)
 * @param {string} [opts.appName]   Application name (defaults to "Invoice Generator")
 * @param {number} [opts.expiresIn] Minutes until expiry (defaults to 15)
 * @returns {string} HTML string ready to send
 */
const resetPasswordTemplate = ({ resetUrl, name, appName = 'Invoice Generator', expiresIn = 15 }) => /* html */`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Reset Your Password — ${appName}</title>
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
      padding: 36px 32px;
      text-align: center;
    }
    .header-logo {
      font-size: 26px;
      font-weight: 800;
      color: #ffffff;
      letter-spacing: -0.5px;
    }
    .header-icon {
      font-size: 40px;
      display: block;
      margin-bottom: 10px;
    }
    .body { padding: 40px 32px; }
    .heading {
      font-size: 20px;
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
    }
    .expiry-box {
      background: #fff7ed;
      border: 1px solid #fed7aa;
      border-radius: 8px;
      padding: 14px 18px;
      margin-bottom: 24px;
      font-size: 13px;
      color: #92400e;
    }
    .expiry-box strong { color: #78350f; }
    .fallback-link {
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      padding: 12px 16px;
      font-size: 12px;
      color: #6b7280;
      word-break: break-all;
      margin-top: 8px;
    }
    .divider {
      border: none;
      border-top: 1px solid #e5e7eb;
      margin: 28px 0;
    }
    .security-note {
      font-size: 13px;
      color: #9ca3af;
      line-height: 1.7;
    }
    .footer {
      background: #f9fafb;
      border-top: 1px solid #e5e7eb;
      padding: 24px 32px;
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
        <span class="header-icon">🔐</span>
        <div class="header-logo">${appName}</div>
      </div>

      <!-- Body -->
      <div class="body">
        <p class="heading">Reset your password${name ? `, ${name}` : ''}</p>

        <p class="text">
          We received a request to reset the password for your account.
          Click the button below to choose a new password.
        </p>

        <!-- Expiry warning -->
        <div class="expiry-box">
          ⏰ <strong>This link expires in ${expiresIn} minutes.</strong>
          If it expires, you can request a new one from the login page.
        </div>

        <!-- CTA -->
        <div class="cta-wrapper">
          <a href="${resetUrl}" class="cta-btn">Reset My Password</a>
        </div>

        <!-- Fallback link -->
        <p class="text" style="font-size:13px;color:#6b7280;">
          Button not working? Copy and paste this URL into your browser:
        </p>
        <div class="fallback-link">${resetUrl}</div>

        <hr class="divider" />

        <p class="security-note">
          If you did not request a password reset, you can safely ignore this email.
          Your password will remain unchanged.<br /><br />
          For security, this link can only be used once and will expire after
          ${expiresIn} minutes.
        </p>
      </div>

      <!-- Footer -->
      <div class="footer">
        <p>${appName} &bull; Automated security email &bull; Do not reply</p>
        <p style="margin-top:4px">
          If you're having trouble, contact support.
        </p>
      </div>

    </div>
  </div>
</body>
</html>
`.trim();

module.exports = resetPasswordTemplate;
