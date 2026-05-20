const router = require('express').Router();
const ctrl = require('../controllers/invoice.controller');
const paymentCtrl = require('../controllers/payment.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { authorize, injectCompany } = require('../middlewares/rbac.middleware');
const { validate } = require('../middlewares/validate.middleware');
const v = require('../validations/invoice.validation');

// ── Public endpoint (no auth — client views invoice by token) ─────────────
router.get('/view/:token', ctrl.viewPublic);

// ── All routes below require auth ─────────────────────────────────────────
router.use(authenticate, injectCompany);

// Next invoice number preview (must be before /:id to avoid route conflict)
router.get('/next-number', ctrl.getNextNumber);

// CRUD
router.post('/',      authorize('admin', 'finance'), validate(v.create),  ctrl.create);
router.get('/',                                                            ctrl.list);
router.get('/:id',                                                         ctrl.getOne);
router.patch('/:id',  authorize('admin', 'finance'), validate(v.update),  ctrl.update);
router.delete('/:id', authorize('admin'),                                  ctrl.cancel);

// Actions
router.post('/:id/send',        authorize('admin', 'finance'), validate(v.sendEmail),     ctrl.send);
router.post('/:id/mark-sent',   authorize('admin', 'finance'),                            ctrl.markAsSent);
router.post('/:id/duplicate',   authorize('admin', 'finance'),                            ctrl.duplicate);
router.post('/:id/credit-note', authorize('admin', 'finance'),                            ctrl.createCreditNote);

// Payments nested under invoice
router.post('/:invoiceId/payments', authorize('admin', 'finance'), validate(v.recordPayment), paymentCtrl.record);
router.get('/:invoiceId/payments',                                                             paymentCtrl.listByInvoice);

router.get('/:id/pdf', authorize('admin', 'finance'), ctrl.getPdf);

module.exports = router;
