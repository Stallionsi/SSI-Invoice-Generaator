const router = require('express').Router();
const ctrl = require('../controllers/auth.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { validate } = require('../middlewares/validate.middleware');
const v = require('../validations/auth.validation');

// Public
router.post('/register', validate(v.register),      ctrl.register);
router.post('/login',    validate(v.login),          ctrl.login);
router.post('/refresh',  validate(v.refreshToken),   ctrl.refreshToken);

// Password Reset (public)
router.post('/forgot-password', validate(v.forgotPassword), ctrl.forgotPassword);
router.post('/reset-password',  validate(v.resetPassword),  ctrl.resetPassword);

// Protected
router.post('/logout',          authenticate, ctrl.logout);
router.get('/me',               authenticate, ctrl.me);
router.patch('/change-password', authenticate, validate(v.changePassword), ctrl.changePassword);

module.exports = router;
