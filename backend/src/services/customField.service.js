const CustomField = require('../models/CustomField.model');
const {
  generateFieldKey,
  validateCustomFieldValues,
  sanitizeCustomFieldValues,
  applyDefaultValues,
  filterByVisibility,
} = require('../utils/customField.util');
const { runBusinessLogic } = require('../utils/businessLogic.util');

// ─── Reserved Schema Keys (per module) ───────────────────────────────────────
// These are the native schema field names (lowercased) for each module.
// A custom field key must never shadow a built-in schema field because that
// would cause `entity.customFields.email` to collide with `entity.email`.
// Keys are stored lowercase-only to match generateFieldKey() output.

const RESERVED_KEYS = {
  client: new Set([
    'clientname', 'companyname', 'email', 'phone', 'alternatephone',
    'billingaddress', 'shippingaddress', 'gstnumber', 'pannumber',
    'currency', 'paymentterms', 'notes', 'portalenabled', 'portalpassword',
    'isactive', 'stats', 'company', 'createdby', 'createdat', 'updatedat', 'id',
  ]),
  invoice: new Set([
    'invoicenumber', 'invoicedate', 'duedate', 'status', 'currency',
    'subtotal', 'taxtotal', 'taxbreakdown', 'discounttotal', 'grandtotal',
    'amountpaid', 'balancedue', 'shippingcharge', 'tdsamount', 'tdsrate',
    'notes', 'termsandconditions', 'lineitems', 'template', 'iscreditnote',
    'senderdetails', 'recipientdetails', 'company', 'client',
    'createdat', 'updatedat', 'id',
  ]),
  payment: new Set([
    'amount', 'currency', 'paymentdate', 'paymentmethod', 'referencenumber',
    'notes', 'company', 'client', 'invoice', 'createdat', 'updatedat', 'id',
  ]),
};

/**
 * Return true when `key` conflicts with a built-in schema field for `module`.
 * Comparison is done on the lowercased key (matches generateFieldKey output).
 */
const isReservedKey = (module, key) => {
  const set = RESERVED_KEYS[module];
  return set ? set.has(key.toLowerCase()) : false;
};

// ─── Auto-infer Field Type from Label ─────────────────────────────────────────

const inferFieldType = (label) => {
  const l = label.toLowerCase();
  if (/email/.test(l))                                       return 'email';
  if (/phone|mobile|tel|contact/.test(l))                    return 'phone';
  if (/\bdate\b|deadline|dob|born|expir/.test(l))            return 'date';
  if (/amount|price|cost|fee|charge|salary|budget/.test(l))  return 'currency';
  if (/\bcount\b|\bnum\b|number|qty|quantity|age|year/.test(l)) return 'number';
  if (/url|website|link|site/.test(l))                       return 'url';
  if (/note|comment|remark|description|detail/.test(l))      return 'textarea';
  if (/address/.test(l))                                     return 'textarea';
  if (/color|colour/.test(l))                                return 'color';
  if (/rating|score|star/.test(l))                           return 'rating';
  if (/tag|label|categor/.test(l))                           return 'tags';
  if (/json|data|payload/.test(l))                           return 'json';
  return 'text';
};

// ─── Create ───────────────────────────────────────────────────────────────────

const create = async (data, companyId, userId) => {
  // Normalize inputType alias → fieldType
  if (data.inputType && !data.fieldType) data.fieldType = data.inputType;
  delete data.inputType;

  // Auto-infer field type when caller omits it (simple mode)
  if (!data.fieldType) data.fieldType = inferFieldType(data.label);

  // Resolve the base key from the caller-supplied value or auto-generate from label.
  // If it collides with a reserved schema field, suffix with _cf so custom field
  // values under customFields.email never shadow the top-level client.email field.
  let baseKey = data.key || generateFieldKey(data.label);
  if (isReservedKey(data.module, baseKey)) {
    baseKey = `${baseKey}_cf`;
  }

  let key = baseKey;
  let suffix = 1;
  while (await CustomField.exists({ company: companyId, module: data.module, key })) {
    key = `${baseKey}_${suffix++}`;
  }

  if (data.order === undefined || data.order === 0) {
    const lastField = await CustomField
      .findOne({ company: companyId, module: data.module, isActive: true, deletedAt: null })
      .sort({ order: -1 })
      .select('order')
      .lean();
    data.order = lastField ? lastField.order + 10 : 10;
  }

  return CustomField.create({
    ...data,
    key,
    company:   companyId,
    createdBy: userId,
    updatedBy: userId,
  });
};

// ─── List ─────────────────────────────────────────────────────────────────────

const list = async (companyId, module, userRole = 'admin', { includeInactive = false } = {}) => {
  const filter = {
    company:   companyId,
    deletedAt: null,
  };

  if (module) filter.module = module;
  if (!includeInactive) filter.isActive = true;

  const fields = await CustomField.find(filter).sort({ order: 1 }).lean();

  return filterByVisibility(fields, userRole);
};

// ─── List All (including soft-deleted) for historical rendering ───────────────

const getDefinitionMap = async (companyId, module) => {
  const fields = await CustomField
    .find({ company: companyId, module })
    .sort({ order: 1 })
    .lean();

  return new Map(fields.map((f) => [f.key, f]));
};

// ─── Get By ID ────────────────────────────────────────────────────────────────

const getById = async (id, companyId) => {
  const field = await CustomField.findOne({ _id: id, company: companyId });
  if (!field) throw Object.assign(new Error('Custom field not found'), { statusCode: 404 });
  return field;
};

// ─── Update ───────────────────────────────────────────────────────────────────

const update = async (id, companyId, data, userId) => {
  // Normalize inputType alias
  if (data.inputType && !data.fieldType) data.fieldType = data.inputType;
  delete data.inputType;

  delete data.key;    // immutable
  delete data.module; // immutable

  const field = await CustomField.findOneAndUpdate(
    { _id: id, company: companyId, deletedAt: null },
    { ...data, updatedBy: userId },
    { new: true, runValidators: true }
  );
  if (!field) throw Object.assign(new Error('Custom field not found'), { statusCode: 404 });
  return field;
};

// ─── Soft Delete ──────────────────────────────────────────────────────────────

const softDelete = async (id, companyId, userId) => {
  const field = await CustomField.findOneAndUpdate(
    { _id: id, company: companyId, deletedAt: null },
    { deletedAt: new Date(), isActive: false, updatedBy: userId },
    { new: true }
  );
  if (!field) throw Object.assign(new Error('Custom field not found'), { statusCode: 404 });
  return field;
};

// ─── Bulk Reorder ─────────────────────────────────────────────────────────────

const reorder = async (companyId, module, fields) => {
  const ops = fields.map(({ id, order }) => ({
    updateOne: {
      filter: { _id: id, company: companyId, module },
      update: { $set: { order } },
    },
  }));
  await CustomField.bulkWrite(ops);
};

// ─── Validate Submitted Values ────────────────────────────────────────────────

const processAndValidate = async (module, values = {}, companyId, excludeId) => {
  const fieldDefs = await CustomField
    .find({ company: companyId, module, isActive: true, deletedAt: null })
    .lean();

  if (!fieldDefs.length) return values;

  const sanitized    = sanitizeCustomFieldValues(fieldDefs, values);
  const withDefaults = applyDefaultValues(fieldDefs, sanitized);

  const { processed, errors: bizErrors } = await runBusinessLogic(
    fieldDefs,
    withDefaults,
    companyId,
    excludeId,
  );

  if (Object.keys(bizErrors).length) {
    const err = new Error('Custom field business logic error');
    err.statusCode = 422;
    err.errors = bizErrors;
    throw err;
  }

  const { valid, errors: valErrors } = validateCustomFieldValues(fieldDefs, processed);
  if (!valid) {
    const err = new Error('Custom field validation failed');
    err.statusCode = 422;
    err.errors = valErrors;
    throw err;
  }

  return processed;
};

module.exports = {
  create,
  list,
  getDefinitionMap,
  getById,
  update,
  softDelete,
  reorder,
  processAndValidate,
};
