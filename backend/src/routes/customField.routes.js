const router = require('express').Router();
const ctrl   = require('../controllers/customField.controller');
const { authenticate }          = require('../middlewares/auth.middleware');
const { authorize, injectCompany } = require('../middlewares/rbac.middleware');
const { validate }              = require('../middlewares/validate.middleware');
const v                         = require('../validations/customField.validation');

// All custom-field routes require authentication
router.use(authenticate, injectCompany);

// ── Read (any authenticated role) ────────────────────────────────────────────
router.get('/',    ctrl.listFields);
router.get('/:id', ctrl.getField);

// ── Write (admin only) ───────────────────────────────────────────────────────
// Note: reorder must come BEFORE /:id so Express does not mistake
// the literal string "reorder" for a Mongo ObjectId param.
router.patch('/reorder',  authorize('admin'), validate(v.reorder),  ctrl.reorderFields);
router.post('/',          authorize('admin'), validate(v.create),   ctrl.createField);
router.patch('/:id',      authorize('admin'), validate(v.update),   ctrl.updateField);
router.delete('/:id',     authorize('admin'),                       ctrl.deleteField);

module.exports = router;
