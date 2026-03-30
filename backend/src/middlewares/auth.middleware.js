const jwt = require('jsonwebtoken');
const User = require('../models/User.model');
const { JWT_SECRET } = require('../config/env');
const { unauthorized } = require('../utils/apiResponse');

/**
 * Verifies JWT Bearer token and attaches user to req.user
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    let token;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.cookies?.accessToken) {
      token = req.cookies.accessToken;
    }

    if (!token) {
      return unauthorized(res, 'No token provided');
    }
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });

    let user = await User.findById(decoded.userId).select('-password -refreshToken');
    if (!user) return unauthorized(res, 'User not found');
    if (!user.isActive) return unauthorized(res, 'Account is deactivated');

    // ── Migrate legacy `company` field → `companies[]` ────────────────────
    // Users created before the multi-company refactor have a single `company`
    // ObjectId. Move it into the new `companies` array on first request.
    if (user.company && (!user.companies || user.companies.length === 0)) {
      user.companies = [user.company];
      user.company   = undefined;
      await user.save({ validateBeforeSave: false });
    }

    req.user = user.toObject();
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') return unauthorized(res, 'Token expired');
    if (err.name === 'JsonWebTokenError') return unauthorized(res, 'Invalid token');
    next(err);
  }
};

/**
 * Optional auth — attaches user if token present, but doesn't block if missing.
 * Used for public invoice view endpoints.
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    let token;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.cookies?.accessToken) {
      token = req.cookies.accessToken;
    }

    if (token) {
      const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
      const u = await User.findById(decoded.userId).select('-password -refreshToken');
      req.user = u ? u.toObject() : null;
    }
    next();
  } catch {
    next(); // ignore auth errors for optional auth
  }
};

module.exports = { authenticate, optionalAuth };
