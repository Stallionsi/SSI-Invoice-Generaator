const { sendEmail } = require('../services/email.service');
const { success } = require('../utils/apiResponse');
const { asyncHandler } = require('../middlewares/error.middleware');
const { EMAIL_FROM_NAME, EMAIL_FROM_ADDRESS } = require('../config/env');

/**
 * POST /api/utils/test-email
 * Admin-only. Sends a test email to verify the active email transport (SMTP, SES, or Resend).
 *
 * Body:
 *   { "to": "you@example.com", "subject": "optional", "message": "optional" }
 */
const testEmail = asyncHandler(async (req, res) => {
  const { to, subject, message } = req.body;

  if (!to) {
    return res.status(400).json({ success: false, message: '"to" email address is required' });
  }

  const emailSubject = subject || `Test email from ${EMAIL_FROM_NAME}`;
  const html = /* html */`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <style>
    body { font-family: Arial, sans-serif; background: #f3f4f6; padding: 32px 16px; }
    .card { max-width: 560px; margin: 0 auto; background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08); }
    .header { background: #059669; padding: 28px 32px; text-align: center; }
    .header h1 { margin: 0; font-size: 22px; color: #fff; font-weight: 700; }
    .body { padding: 32px; font-size: 15px; color: #374151; line-height: 1.7; }
    .badge { display: inline-block; background: #d1fae5; color: #065f46; font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: 999px; margin-bottom: 16px; }
    .meta { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 14px 16px; font-size: 13px; color: #6b7280; margin-top: 24px; }
    .meta strong { color: #374151; }
    .footer { background: #f9fafb; border-top: 1px solid #e5e7eb; padding: 16px 32px; text-align: center; font-size: 12px; color: #9ca3af; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>✅ Email Delivery Test</h1>
    </div>
    <div class="body">
      <div class="badge">TEST EMAIL</div>
      <p>${message || `This is a test email from <strong>${EMAIL_FROM_NAME}</strong> to confirm that your email transport is configured correctly.`}</p>
      <p>If you received this, your email integration is working.</p>
      <div class="meta">
        <strong>Sent at:</strong> ${new Date().toUTCString()}<br />
        <strong>From:</strong> ${EMAIL_FROM_NAME} &lt;${EMAIL_FROM_ADDRESS}&gt;<br />
        <strong>To:</strong> ${to}
      </div>
    </div>
    <div class="footer">${EMAIL_FROM_NAME} — Automated test, do not reply</div>
  </div>
</body>
</html>`.trim();

  await sendEmail({
    to,
    subject:  emailSubject,
    html,
    type:     'other',
    companyId: req.companyId || null,
    userId:   req.user?._id || null,
  });

  success(res, { to, subject: emailSubject }, 'Test email sent successfully');
});

module.exports = { testEmail };
