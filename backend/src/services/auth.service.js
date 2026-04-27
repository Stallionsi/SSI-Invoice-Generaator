const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User.model');
const Company = require('../models/Company.model');
const { JWT_SECRET, JWT_EXPIRES_IN, JWT_REFRESH_SECRET, JWT_REFRESH_EXPIRES_IN, APP_URL, EMAIL_FROM_NAME } = require('../config/env');
const { sendPasswordResetEmail, sendWelcomeEmail } = require('./email.service');

// ─── Token Generators ──────────────────────────────────────────────────────
const generateAccessToken = (userId, role, companyId) => {
  return jwt.sign({ userId, role, companyId }, JWT_SECRET, {
    expiresIn:  JWT_EXPIRES_IN,
    algorithm:  'HS256',
  });
};

const generateRefreshToken = (userId) => {
  return jwt.sign({ userId }, JWT_REFRESH_SECRET, {
    expiresIn: JWT_REFRESH_EXPIRES_IN,
    algorithm: 'HS256',
  });
};

// ─── Service Methods ───────────────────────────────────────────────────────
const register = async (data) => {
  const { name, email, password, companyName } = data;

  const existing = await User.findOne({ email });
  if (existing) {
    const err = new Error('Email already registered');
    err.statusCode = 409;
    throw err;
  }

  // Create company first
  const company = await Company.create({ companyName });

  // Create user as admin of the new company
  const user = await User.create({
    name,
    email,
    password,
    companies: [company._id],
    role: 'admin',
  });

  // Set company owner
  company.owner = user._id;
  await company.save();

  const accessToken  = generateAccessToken(user._id, user.role, user.companies?.[0]);
  const refreshToken = generateRefreshToken(user._id);

  // Store hashed refresh token
  user.refreshToken = crypto.createHash('sha256').update(refreshToken).digest('hex');
  await user.save({ validateBeforeSave: false });

  // Send welcome email — fire-and-forget; failure must not break registration
  sendWelcomeEmail({
    to:       user.email,
    name:     user.name,
    loginUrl: `${APP_URL}/login`,
    appName:  EMAIL_FROM_NAME,
  }).catch(() => {});

  return { user: user.toSafeObject(), accessToken, refreshToken };
};

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS    = 15 * 60 * 1000; // 15 minutes

const login = async (email, password) => {
  const user = await User.findOne({ email }).select('+password +refreshToken');
  if (!user || !user.isActive) {
    const err = new Error('Invalid credentials');
    err.statusCode = 401;
    throw err;
  }

  // Reject if account is currently locked
  if (user.isLocked()) {
    const minutesLeft = Math.ceil((user.lockUntil - Date.now()) / 60000);
    const err = new Error(`Account locked. Try again in ${minutesLeft} minute(s).`);
    err.statusCode = 423;
    throw err;
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    user.failedLoginAttempts += 1;
    if (user.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
      user.lockUntil = new Date(Date.now() + LOCK_DURATION_MS);
    }
    await user.save({ validateBeforeSave: false });

    const err = new Error('Invalid credentials');
    err.statusCode = 401;
    throw err;
  }

  // Success — reset lockout counters
  const accessToken  = generateAccessToken(user._id, user.role, user.companies?.[0]);
  const refreshToken = generateRefreshToken(user._id);

  user.refreshToken        = crypto.createHash('sha256').update(refreshToken).digest('hex');
  user.lastLogin           = new Date();
  user.failedLoginAttempts = 0;
  user.lockUntil           = undefined;
  await user.save({ validateBeforeSave: false });

  return { user: user.toSafeObject(), accessToken, refreshToken };
};

const refreshAccessToken = async (token) => {
  let decoded;
  try {
    decoded = jwt.verify(token, JWT_REFRESH_SECRET, { algorithms: ['HS256'] });
  } catch {
    const err = new Error('Invalid or expired refresh token');
    err.statusCode = 401;
    throw err;
  }

  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
  const user = await User.findOne({ _id: decoded.userId, refreshToken: hashedToken }).select('+refreshToken');

  if (!user) {
    const err = new Error('Refresh token not found or already rotated');
    err.statusCode = 401;
    throw err;
  }

  // Rotate: issue new pair
  const newAccessToken  = generateAccessToken(user._id, user.role, user.companies?.[0]);
  const newRefreshToken = generateRefreshToken(user._id);

  user.refreshToken = crypto.createHash('sha256').update(newRefreshToken).digest('hex');
  await user.save({ validateBeforeSave: false });

  return { accessToken: newAccessToken, refreshToken: newRefreshToken };
};

const logout = async (userId) => {
  await User.findByIdAndUpdate(userId, { refreshToken: null });
};

const changePassword = async (userId, currentPassword, newPassword) => {
  const user = await User.findById(userId).select('+password');
  if (!user) throw Object.assign(new Error('User not found'), { statusCode: 404 });

  const isMatch = await user.comparePassword(currentPassword);
  if (!isMatch) throw Object.assign(new Error('Current password is incorrect'), { statusCode: 400 });

  user.password = newPassword;
  await user.save();
};

const getMe = async (userId) => {
  return User.findById(userId).populate('company', 'companyName logo').lean();
};

const forgotPassword = async (email) => {
  const user = await User.findOne({ email });
  // Always respond the same way to prevent user enumeration
  if (!user || !user.isActive) return;

  // Generate raw token and hash it for storage
  const rawToken    = crypto.randomBytes(32).toString('hex');
  const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

  user.passwordResetToken   = hashedToken;
  user.passwordResetExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
  await user.save({ validateBeforeSave: false });

  const resetUrl = `${APP_URL}/reset-password?token=${rawToken}`;
  await sendPasswordResetEmail({ to: user.email, resetUrl, name: user.name });
};

const resetPassword = async (rawToken, newPassword) => {
  const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

  const user = await User.findOne({
    passwordResetToken:   hashedToken,
    passwordResetExpires: { $gt: Date.now() },
  }).select('+passwordResetToken +passwordResetExpires');

  if (!user) {
    const err = new Error('Reset token is invalid or has expired');
    err.statusCode = 400;
    throw err;
  }

  user.password             = newPassword;
  user.passwordResetToken   = undefined;
  user.passwordResetExpires = undefined;
  await user.save();
};

module.exports = { register, login, refreshAccessToken, logout, changePassword, getMe, forgotPassword, resetPassword };
