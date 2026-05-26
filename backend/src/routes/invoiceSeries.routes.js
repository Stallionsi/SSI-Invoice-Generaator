'use strict';

const router = require('express').Router();
const ctrl   = require('../controllers/invoiceSeries.controller');
const { authenticate }              = require('../middlewares/auth.middleware');
const { authorize, injectCompany }  = require('../middlewares/rbac.middleware');

// All routes require auth + company context
router.use(authenticate, injectCompany);

router.get('/',    ctrl.list);
router.post('/',   authorize('admin', 'finance'), ctrl.create);
router.patch('/:id',         authorize('admin', 'finance'), ctrl.update);
router.patch('/:id/default', authorize('admin', 'finance'), ctrl.setDefault);
router.delete('/:id',        authorize('admin'),             ctrl.remove);

module.exports = router;
