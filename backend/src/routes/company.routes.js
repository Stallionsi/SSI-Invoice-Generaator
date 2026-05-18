const router = require('express').Router();
const ctrl = require('../controllers/company.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { authorize, injectCompany } = require('../middlewares/rbac.middleware');

// All company routes require auth
router.use(authenticate, injectCompany);

router.get('/',           ctrl.listMyCompanies);
router.post('/',          authorize('admin'), ctrl.create);
router.get('/me',         ctrl.getMyCompany);
router.patch('/me',       authorize('admin'),            ctrl.update);
router.get('/settings',   authorize('admin', 'finance'), ctrl.getInvoiceSettings);
router.patch('/settings', authorize('admin'),            ctrl.updateInvoiceSettings);

// Admin: inspect all companies in the DB + link them to the current user.
// Must come BEFORE /:id so Express doesn't treat 'all' or 'link' as an ID.
router.get('/all',  authorize('admin'), ctrl.listAll);
router.post('/link', authorize('admin'), ctrl.linkToUser);

// GET /:id must come AFTER all literal-path routes.
router.get('/:id', ctrl.getOne);

module.exports = router;
