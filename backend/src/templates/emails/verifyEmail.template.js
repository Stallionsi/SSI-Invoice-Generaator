const verifyEmailTemplate = ({ name, verifyUrl, appName = 'Invoice Generator' }) => /* html */`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Verify your email — ${appName}</title>
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
    .header-icon { font-size: 42px; display: block; margin-bottom: 10px; }
    .header-logo { font-size: 24px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px; }
    .body { padding: 40px 32px; }
    .heading { font-size: 20px; font-weight: 700; color: #111827; margin-bottom: 14px; }
    .text { font-size: 15px; line-height: 1.7; color: #4b5563; margin-bottom: 16px; }
    .cta-wrapper { text-align: center; margin: 32px 0; }
    .cta-btn {
      display: inline-block;
      padding: 14px 40px;
      background: #1a56db;
      color: #ffffff !important;
      text-decoration: none;
      border-radius: 8px;
      font-size: 15px;
      font-weight: 600;
    }
    .expiry-box {
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      border-radius: 8px;
      padding: 12px 16px;
      margin-bottom: 24px;
      font-size: 13px;
      color: #1e40af;
    }
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
    .divider { border: none; border-top: 1px solid #e5e7eb; margin: 28px 0; }
    .note { font-size: 13px; color: #9ca3af; line-height: 1.7; }
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
      <div class="header">
        <span class="header-icon">✉️</span>
        <div class="header-logo">${appName}</div>
      </div>
      <div class="body">
        <p class="heading">Verify your email address${name ? `, ${name}` : ''}</p>
        <p class="text">
          Thanks for signing up! Please confirm your email address by clicking
          the button below. This keeps your account secure.
        </p>
        <div class="expiry-box">
          ⏰ <strong>This link expires in 24 hours.</strong>
          If it expires, simply register again.
        </div>
        <div class="cta-wrapper">
          <a href="${verifyUrl}" class="cta-btn">Verify My Email</a>
        </div>
        <p class="text" style="font-size:13px;color:#6b7280;">
          Button not working? Copy and paste this URL into your browser:
        </p>
        <div class="fallback-link">${verifyUrl}</div>
        <hr class="divider" />
        <p class="note">
          If you did not create an account, you can safely ignore this email.
        </p>
      </div>
      <div class="footer">
        <p>${appName} &bull; Automated security email &bull; Do not reply</p>
      </div>
    </div>
  </div>
</body>
</html>
`.trim();

module.exports = verifyEmailTemplate;
