const router = require('express').Router();
const ctrl = require('../controllers/report.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { authorize, injectCompany } = require('../middlewares/rbac.middleware');

router.use(authenticate, injectCompany, authorize('admin', 'finance'));

router.get('/revenue',        ctrl.revenue);
router.get('/pending',        ctrl.pending);
router.get('/clients',        ctrl.clientRevenue);
router.get('/taxes',          ctrl.taxes);
router.get('/export/invoices', ctrl.exportCsv);

module.exports = router;
