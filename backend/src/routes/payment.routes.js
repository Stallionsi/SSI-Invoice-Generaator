const router = require('express').Router();
const ctrl = require('../controllers/payment.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { authorize, injectCompany } = require('../middlewares/rbac.middleware');

router.use(authenticate, injectCompany);

// All payments for the company
router.get('/', authorize('admin', 'finance'), ctrl.listAll);

module.exports = router;
