const { Resend } = require('resend');
const { RESEND_API_KEY, USE_RESEND } = require('../config/env');
const logger = require('./logger');

// ─── Lazy singleton ────────────────────────────────────────────────────────────
// The client is only instantiated on first use so a missing key does not
// crash startup when USE_RESEND is false.
let _client = null;

const getClient = () => {
  if (!USE_RESEND) {
    throw new Error('Resend is not enabled. Set USE_RESEND=true in your environment.');
  }
  if (!RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is missing. Add it to your environment variables.');
  }
  if (!_client) {
    _client = new Resend(RESEND_API_KEY);
    logger.info('Resend client initialized');
  }
  return _client;
};

/**
 * Send an email via Resend, with optional PDF/file attachments.
 *
 * @param {object}   opts
 * @param {string|string[]} opts.to          Recipient(s)
 * @param {string}          opts.from        Sender (e.g. "ACME <noreply@acme.com>")
 * @param {string}          opts.subject
 * @param {string}          opts.html
 * @param {string|string[]} [opts.cc]
 * @param {string|string[]} [opts.bcc]
 * @param {string}          [opts.replyTo]
 * @param {Array<{filename: string, content: Buffer}>} [opts.attachments]
 *   Each attachment must have a `filename` and a `content` Buffer.
 *   The Buffer is base64-encoded internally before being sent to Resend.
 * @returns {Promise<{ id: string }>}  Resend message ID
 */
const sendViaResend = async ({ to, from, subject, html, cc, bcc, replyTo, attachments = [], headers = {} }) => {
  const client = getClient();

  // Resend expects: { filename, content: base64string, contentType?, encoding? }
  const resendAttachments = attachments.map((a) => ({
    filename:    a.filename,
    content:     Buffer.isBuffer(a.content) ? a.content.toString('base64') : a.content,
    ...(a.contentType && { contentType: a.contentType }),
    ...(a.encoding    && { encoding:    a.encoding    }),
  }));

  const { data, error } = await client.emails.send({
    from,
    to:      Array.isArray(to) ? to : [to],
    subject,
    html,
    ...(cc                       && { cc:          Array.isArray(cc)  ? cc  : [cc]  }),
    ...(bcc                      && { bcc:         Array.isArray(bcc) ? bcc : [bcc] }),
    ...(replyTo                  && { reply_to:    replyTo }),
    ...(resendAttachments.length      && { attachments: resendAttachments }),
    ...(Object.keys(headers).length   && { headers }),
  });

  if (error) {
    const err = new Error(error.message || 'Resend delivery failed');
    err.resendError = error;
    throw err;
  }

  return data; // { id: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' }
};

module.exports = { sendViaResend, getClient };
