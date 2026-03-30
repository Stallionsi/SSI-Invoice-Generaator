const { forbidden } = require('../utils/apiResponse');

/**
 * Role-Based Access Control middleware
 *
 * Usage:
 *   router.delete('/:id', authenticate, authorize('admin'), controller.delete)
 *   router.post('/',      authenticate, authorize('admin', 'finance'), controller.create)
 */
const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return forbidden(res, 'Authentication required');
    }
    if (!allowedRoles.includes(req.user.role)) {
      return forbidden(res, `Access denied. Required role: ${allowedRoles.join(' or ')}`);
    }
    next();
  };
};

/**
 * Ensures the user belongs to the company in req.params.companyId
 * or req.body.company. Prevents cross-company data access.
 */
const sameCompany = (req, res, next) => {
  const targetCompany = req.params.companyId || req.body.company;
  if (targetCompany) {
    const userCompanyIds = (req.user.companies || []).map((c) => c.toString());
    if (!userCompanyIds.includes(targetCompany.toString())) {
      return forbidden(res, 'Access to this company\'s resources is denied');
    }
  }
  next();
};

/**
 * Resolves the active company for this request.
 *
 * Priority:
 *   1. X-Company-Id header  (company switcher)
 *   2. First company in user.companies[]  (default)
 *
 * If the requested company is not in the user's companies list the
 * request is rejected with 403 — preventing cross-company data access.
 */
const injectCompany = (req, res, next) => {
  const userCompanies = (req.user?.companies || []).map((c) => c.toString());
  const requested     = req.headers['x-company-id'];

  if (requested) {
    if (!userCompanies.includes(requested)) {
      return forbidden(res, 'You do not have access to this company');
    }
    req.companyId = requested;
  } else {
    req.companyId = userCompanies[0] || null;
  }

  next();
};

module.exports = { authorize, sameCompany, injectCompany };
