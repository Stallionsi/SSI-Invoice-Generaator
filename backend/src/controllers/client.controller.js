const clientService = require('../services/client.service');
const { success, created, paginated } = require('../utils/apiResponse');
const { asyncHandler } = require('../middlewares/error.middleware');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a clean, safe body object from req.body.
 * Joi middleware already applies defaults; this is the last-resort safety net
 * in case a route is called without the validate() middleware, or a field
 * somehow slips through with an unexpected type.
 *
 * Rules applied:
 *   - customFields must be a plain object (default {})
 *   - billingAddress / shippingAddress must be object or undefined (never null)
 *   - No extra keys beyond what Joi already passed
 */
const buildClientBody = (raw) => ({
  ...raw,
  customFields:    (raw.customFields    && typeof raw.customFields    === 'object') ? raw.customFields    : {},
  billingAddress:  (raw.billingAddress  && typeof raw.billingAddress  === 'object') ? raw.billingAddress  : undefined,
  shippingAddress: (raw.shippingAddress && typeof raw.shippingAddress === 'object') ? raw.shippingAddress : undefined,
});

// ─── Handlers ────────────────────────────────────────────────────────────────

const create = asyncHandler(async (req, res) => {
  const client = await clientService.create(buildClientBody(req.body), req.companyId, req.user._id);
  created(res, { client }, 'Client created');
});

const list = asyncHandler(async (req, res) => {
  const { clients, pagination } = await clientService.list(req.companyId, req.query);
  paginated(res, { clients }, pagination);
});

const getOne = asyncHandler(async (req, res) => {
  const client = await clientService.getById(req.params.id, req.companyId);
  success(res, { client });
});

const update = asyncHandler(async (req, res) => {
  const client = await clientService.update(req.params.id, req.companyId, buildClientBody(req.body));
  success(res, { client }, 'Client updated');
});

const remove = asyncHandler(async (req, res) => {
  await clientService.remove(req.params.id, req.companyId);
  success(res, {}, 'Client deleted');
});

module.exports = { create, list, getOne, update, remove };
