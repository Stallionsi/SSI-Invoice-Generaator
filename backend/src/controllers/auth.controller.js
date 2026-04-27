const authService = require('../services/auth.service');
const { success, created } = require('../utils/apiResponse');
const { asyncHandler } = require('../middlewares/error.middleware');

const register = asyncHandler(async (req, res) => {
  const result = await authService.register(req.body);
  created(res, result, 'Account created successfully');
});

const login = asyncHandler(async (req, res) => {
  const result = await authService.login(req.body.email, req.body.password);

  const cookieOptions = {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  };

  res.cookie('accessToken',  result.accessToken,  { ...cookieOptions, maxAge: 60 * 60 * 1000 });          // 1h
  res.cookie('refreshToken', result.refreshToken, { ...cookieOptions, maxAge: 7 * 24 * 60 * 60 * 1000 }); // 7d

  success(res, result, 'Login successful');
});

const refreshToken = asyncHandler(async (req, res) => {
  // Accept token from httpOnly cookie (browser) or body (API clients)
  const token = req.cookies?.refreshToken || req.body?.refreshToken;
  if (!token) {
    return res.status(401).json({ success: false, message: 'No refresh token provided' });
  }

  const result = await authService.refreshAccessToken(token);

  // Reissue cookies so the browser session stays alive
  const cookieOptions = {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  };
  res.cookie('accessToken',  result.accessToken,  { ...cookieOptions, maxAge: 60 * 60 * 1000 });          // 1h
  res.cookie('refreshToken', result.refreshToken, { ...cookieOptions, maxAge: 7 * 24 * 60 * 60 * 1000 }); // 7d

  success(res, result, 'Token refreshed');
});

const logout = asyncHandler(async (req, res) => {
  await authService.logout(req.user._id);
  success(res, {}, 'Logged out successfully');
});

const me = asyncHandler(async (req, res) => {
  const user = await authService.getMe(req.user._id);
  success(res, { user });
});

const changePassword = asyncHandler(async (req, res) => {
  await authService.changePassword(req.user._id, req.body.currentPassword, req.body.newPassword);
  success(res, {}, 'Password changed successfully');
});

const forgotPassword = asyncHandler(async (req, res) => {
  await authService.forgotPassword(req.body.email);
  // Always return success to prevent email enumeration
  success(res, {}, 'If an account with that email exists, a password reset link has been sent');
});

const resetPassword = asyncHandler(async (req, res) => {
  await authService.resetPassword(req.body.token, req.body.password);
  success(res, {}, 'Password has been reset successfully');
});

const verifyEmail = asyncHandler(async (req, res) => {
  await authService.verifyEmail(req.query.token);
  success(res, {}, 'Email verified successfully. You can now sign in.');
});

const resendVerification = asyncHandler(async (req, res) => {
  await authService.resendVerification(req.body.email);
  success(res, {}, 'If your email is registered and unverified, a new link has been sent.');
});

module.exports = { register, login, refreshToken, logout, me, changePassword, forgotPassword, resetPassword, verifyEmail, resendVerification };
