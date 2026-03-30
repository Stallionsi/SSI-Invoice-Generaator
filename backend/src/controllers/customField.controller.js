const customFieldService = require('../services/customField.service');
const { success, created, paginated } = require('../utils/apiResponse');
const { asyncHandler } = require('../middlewares/error.middleware');

// POST /api/custom-fields
const createField = asyncHandler(async (req, res) => {
  const field = await customFieldService.create(req.body, req.companyId, req.user._id);
  created(res, { field }, 'Custom field created');
});

// GET /api/custom-fields?module=invoice&includeInactive=false
const listFields = asyncHandler(async (req, res) => {
  const { module, includeInactive } = req.query;
  const fields = await customFieldService.list(
    req.companyId,
    module,
    req.user.role,
    { includeInactive: includeInactive === 'true' }
  );
  success(res, { fields, count: fields.length });
});

// GET /api/custom-fields/:id
const getField = asyncHandler(async (req, res) => {
  const field = await customFieldService.getById(req.params.id, req.companyId);
  success(res, { field });
});

// PATCH /api/custom-fields/:id
const updateField = asyncHandler(async (req, res) => {
  const field = await customFieldService.update(req.params.id, req.companyId, req.body, req.user._id);
  success(res, { field }, 'Custom field updated');
});

// DELETE /api/custom-fields/:id
const deleteField = asyncHandler(async (req, res) => {
  await customFieldService.softDelete(req.params.id, req.companyId, req.user._id);
  success(res, {}, 'Custom field deleted');
});

// PATCH /api/custom-fields/reorder
const reorderFields = asyncHandler(async (req, res) => {
  await customFieldService.reorder(req.companyId, req.body.module, req.body.fields);
  success(res, {}, 'Fields reordered');
});

module.exports = { createField, listFields, getField, updateField, deleteField, reorderFields };
