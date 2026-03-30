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

module.exports = router;
