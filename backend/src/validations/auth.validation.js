const Joi = require('joi');

const register = Joi.object({
  name:        Joi.string().trim().min(2).max(100).required(),
  email:       Joi.string().email().lowercase().required(),
  password:    Joi.string().min(8).max(128)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .required()
    .messages({
      'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, and one number',
    }),
  companyName: Joi.string().trim().min(2).max(200).required(),
});

const login = Joi.object({
  email: Joi.string().email().lowercase().required(),
  password: Joi.string().required(),
});

// refreshToken may come from httpOnly cookie (empty body) or explicitly in body (API clients)
const refreshToken = Joi.object({
  refreshToken: Joi.string().optional(),
});

const changePassword = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: Joi.string().min(8).max(128)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .required(),
});

const forgotPassword = Joi.object({
  email: Joi.string().email().lowercase().required(),
});

const resetPassword = Joi.object({
  token:    Joi.string().required(),
  password: Joi.string().min(8).max(128)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .required()
    .messages({
      'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, and one number',
    }),
});

module.exports = { register, login, refreshToken, changePassword, forgotPassword, resetPassword };
