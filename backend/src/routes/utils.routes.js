const router = require('express').Router();
const { testEmail } = require('../controllers/utils.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { authorize } = require('../middlewares/rbac.middleware');

// POST /api/utils/test-email — admin only, requires valid auth token
router.post('/test-email', authenticate, authorize('admin'), testEmail);

// GET /api/utils/ping-resend — NO auth, raw Resend call, debug only
// Tells you in one hit whether Resend itself works from this machine.
router.get('/ping-resend', async (req, res) => {
  try {
    const { Resend } = require('resend');
    const { RESEND_API_KEY } = require('../config/env');

    console.log('[ping-resend] RESEND_API_KEY present:', !!RESEND_API_KEY);
    console.log('[ping-resend] Key prefix:', RESEND_API_KEY?.slice(0, 8));

    const resend = new Resend(RESEND_API_KEY);

    const { data, error } = await resend.emails.send({
      from:    'Invoice Generator <onboarding@resend.dev>',
      to:      ['ss1380820@gmail.com'],
      subject: 'Resend Ping Test',
      html:    '<h1>Resend is working</h1><p>If you received this, the Resend API key and from-address are valid.</p>',
    });

    console.log('[ping-resend] data:', data);
    console.log('[ping-resend] error:', error);

    if (error) {
      return res.status(500).json({ ok: false, error });
    }

    return res.json({ ok: true, messageId: data?.id });
  } catch (err) {
    console.error('[ping-resend] threw:', err);
    return res.status(500).json({ ok: false, message: err.message, stack: err.stack });
  }
});

module.exports = router;
