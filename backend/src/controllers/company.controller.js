const Company = require('../models/Company.model');
const User = require('../models/User.model');
const { encrypt } = require('../utils/encryption.util');
const { success, created, notFound, forbidden, badRequest } = require('../utils/apiResponse');
const { asyncHandler } = require('../middlewares/error.middleware');

const create = asyncHandler(async (req, res) => {
  const company = await Company.create({ ...req.body, owner: req.user._id });

  // Add new company to user's companies list
  await User.findByIdAndUpdate(req.user._id, { $addToSet: { companies: company._id } });

  created(res, { company }, 'Company created');
});

const listMyCompanies = asyncHandler(async (req, res) => {
  const companies = await Company.find({
    _id: { $in: req.user.companies || [] },
  })
    // Include shortCode + invoiceSettings.prefix so the frontend can display
    // the invoice prefix in the company switcher and invoice number preview.
    .select('companyName shortCode gstNumber invoiceSettings logo isActive')
    .lean();
  success(res, { companies });
});

// Fetch a single company the authenticated user has access to.
// Used by the Create Invoice page to pre-populate sender details when
// the user switches companies mid-form (Phase 4).
const getOne = asyncHandler(async (req, res) => {
  const userCompanyIds = (req.user.companies || []).map((c) => c.toString());
  if (!userCompanyIds.includes(req.params.id)) {
    return forbidden(res, 'You do not have access to this company');
  }
  const company = await Company.findById(req.params.id).lean();
  if (!company) return notFound(res, 'Company not found');
  success(res, { company });
});

const getMyCompany = asyncHandler(async (req, res) => {
  const company = await Company.findById(req.companyId).lean();
  if (!company) return notFound(res, 'Company not found');
  success(res, { company });
});

const update = asyncHandler(async (req, res) => {
  const body = { ...req.body };
  // Encrypt SMTP password before persisting
  if (body.smtpSettings?.pass) {
    body.smtpSettings = { ...body.smtpSettings, pass: encrypt(body.smtpSettings.pass) };
  }
  const company = await Company.findOneAndUpdate(
    { _id: req.companyId },
    body,
    { new: true, runValidators: true }
  );
  if (!company) return notFound(res, 'Company not found');
  success(res, { company }, 'Company updated');
});

const getInvoiceSettings = asyncHandler(async (req, res) => {
  const company = await Company.findById(req.companyId).select('invoiceSettings').lean();
  success(res, { settings: company?.invoiceSettings });
});

const updateInvoiceSettings = asyncHandler(async (req, res) => {
  // Use $set with dot-notation to merge fields without overwriting unset ones
  const setPayload = {};
  for (const [key, value] of Object.entries(req.body)) {
    setPayload[`invoiceSettings.${key}`] = value;
  }
  const company = await Company.findByIdAndUpdate(
    req.companyId,
    { $set: setPayload },
    { new: true, runValidators: true }
  ).select('invoiceSettings');
  success(res, { settings: company.invoiceSettings }, 'Invoice settings updated');
});

// List every Company document in the database.
// Each entry includes a `linked` boolean showing whether the requesting user
// already has access to that company. Admin-only.
const listAll = asyncHandler(async (req, res) => {
  const companies   = await Company.find().select('companyName shortCode gstNumber isActive owner').lean();
  const linkedSet   = new Set((req.user.companies || []).map((id) => id.toString()));
  const result      = companies.map((c) => ({ ...c, linked: linkedSet.has(c._id.toString()) }));
  success(res, { companies: result });
});

// Add one or more company IDs to the current user's companies[] array.
// Idempotent — safe to call multiple times ($addToSet never duplicates).
// Admin-only.
const linkToUser = asyncHandler(async (req, res) => {
  const { companyIds } = req.body;
  if (!Array.isArray(companyIds) || companyIds.length === 0) {
    return badRequest(res, 'companyIds must be a non-empty array');
  }
  const found = await Company.countDocuments({ _id: { $in: companyIds } });
  if (found !== companyIds.length) {
    return notFound(res, 'One or more company IDs not found');
  }
  await User.findByIdAndUpdate(req.user._id, {
    $addToSet: { companies: { $each: companyIds } },
  });
  success(res, {}, `${companyIds.length} company linked`);
});

module.exports = { create, listMyCompanies, getOne, getMyCompany, update, getInvoiceSettings, updateInvoiceSettings, listAll, linkToUser };
