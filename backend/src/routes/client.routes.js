const router = require('express').Router();
const ctrl = require('../controllers/client.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { authorize, injectCompany } = require('../middlewares/rbac.middleware');
const { validate } = require('../middlewares/validate.middleware');
const v = require('../validations/client.validation');

router.use(authenticate, injectCompany);

router.post('/',      authorize('admin', 'finance'), validate(v.create), ctrl.create);
router.get('/',                                       ctrl.list);
router.get('/:id',                                    ctrl.getOne);
router.patch('/:id',  authorize('admin', 'finance'), validate(v.update), ctrl.update);
router.delete('/:id', authorize('admin'),             ctrl.remove);

module.exports = router;
