const Company = require('../models/Company.model');
const User = require('../models/User.model');
const { encrypt } = require('../utils/encryption.util');
const { success, created, notFound } = require('../utils/apiResponse');
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
  }).select('companyName logo isActive').lean();
  success(res, { companies });
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

module.exports = { create, listMyCompanies, getMyCompany, update, getInvoiceSettings, updateInvoiceSettings };
