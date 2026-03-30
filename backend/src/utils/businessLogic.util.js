/**
 * Business Logic Execution Layer
 *
 * Runs per-field transformations and auto-generation tasks
 * AFTER Joi schema validation and BEFORE saving to MongoDB.
 *
 * Processing order in processAndValidate:
 *   sanitize → applyDefaults → runBusinessLogic → validateRules
 */

const CustomField = require('../models/CustomField.model');

// ─── Auto-Code Generator ──────────────────────────────────────────────────────

/**
 * Atomically increment the field's counter and build a code from its pattern.
 *
 * Pattern tokens:
 *   {PREFIX}   — field key uppercased, first 4 chars (fallback)
 *   {YEAR}     — full 4-digit year
 *   {MONTH}    — zero-padded 2-digit month
 *   {SEQ:N}    — sequence padded to N digits  (e.g. {SEQ:4} → 0042)
 *   {SEQ}      — sequence padded to 4 digits  (shorthand)
 *
 * Example patterns:
 *   "CLT-{YEAR}-{SEQ:4}"      → CLT-2026-0001
 *   "{PREFIX}/{YEAR}/{SEQ:5}" → GSTN/2026/00001
 */
const generateAutoCode = async (fieldDef) => {
  // Atomically increment — safe under concurrent requests
  const updated = await CustomField.findByIdAndUpdate(
    fieldDef._id,
    { $inc: { counter: 1 } },
    { new: true }
  );

  const seq     = updated.counter;
  const now     = new Date();
  const year    = now.getFullYear();
  const month   = String(now.getMonth() + 1).padStart(2, '0');
  const prefix  = (fieldDef.key || 'FIELD').substring(0, 4).toUpperCase();
  const pattern = fieldDef.autoCodePattern
    || fieldDef.defaultValue
    || `${prefix}-{YEAR}-{SEQ:4}`;

  return pattern
    .replace('{PREFIX}', prefix)
    .replace('{YEAR}',   year)
    .replace('{MONTH}',  month)
    .replace(/{SEQ:(\d+)}/g, (_, n) => String(seq).padStart(Number(n), '0'))
    .replace('{SEQ}', String(seq).padStart(4, '0'));
};

// ─── Per-Type Value Transformer ───────────────────────────────────────────────

/**
 * Normalize a single field value based on its type.
 * Only transforms; never rejects — validation happens separately.
 */
const transformValue = (fieldType, value) => {
  if (value === undefined || value === null || value === '') return value;

  switch (fieldType) {
    case 'email':
      return String(value).toLowerCase().trim();

    case 'phone':
      // Strip anything that isn't a digit, +, -, (, ), or space
      return String(value).replace(/[^\d+\-() ]/g, '').trim();

    case 'number':
    case 'currency':
    case 'percentage': {
      const n = Number(value);
      return isNaN(n) ? value : n;
    }

    case 'boolean':
      if (typeof value === 'boolean') return value;
      return value === 'true' || value === '1' || value === 1;

    case 'url': {
      const s = String(value).trim();
      if (!s) return s;
      return /^https?:\/\//i.test(s) ? s : `https://${s}`;
    }

    case 'date':
    case 'datetime': {
      // Normalise to ISO string; keep original if unparseable
      const d = new Date(value);
      return isNaN(d.getTime()) ? value : d.toISOString().slice(0, fieldType === 'date' ? 10 : 19);
    }

    case 'text':
    case 'textarea':
    case 'richtext':
    case 'refId':
    case 'autoCode':
      return typeof value === 'string' ? value.trim() : value;

    default:
      return value;
  }
};

// ─── Uniqueness Checker ───────────────────────────────────────────────────────

/**
 * Verify that a field marked validation.unique = true
 * doesn't already exist for another document in the same company+module.
 */
const checkUniqueness = async (fieldDef, value, companyId, excludeEntityId) => {
  if (!fieldDef.validation?.unique || value === '' || value === null || value === undefined) {
    return null; // no uniqueness check needed
  }

  const Model = (() => {
    switch (fieldDef.module) {
      case 'client':  return require('../models/Client.model');
      case 'invoice': return require('../models/Invoice.model');
      default:        return null;
    }
  })();

  if (!Model) return null;

  const filter = {
    company: companyId,
    [`customFields.${fieldDef.key}`]: value,
  };
  if (excludeEntityId) filter._id = { $ne: excludeEntityId };

  const exists = await Model.exists(filter);
  return exists ? `${fieldDef.label} must be unique — this value is already in use` : null;
};

// ─── Main Runner ──────────────────────────────────────────────────────────────

/**
 * Run the full business logic pipeline over a set of custom field values.
 *
 * @param {Array}   fieldDefs      - Active CustomField documents for the module
 * @param {Object}  values         - Raw { key: value } map from the request
 * @param {string}  companyId      - For uniqueness checks
 * @param {string}  [excludeId]    - Entity _id to exclude from uniqueness (used on update)
 *
 * @returns {{ processed: Object, errors: Object }}
 */
const runBusinessLogic = async (fieldDefs, values, companyId, excludeId) => {
  const processed = { ...values };
  const errors    = {};

  for (const field of fieldDefs) {
    const raw = processed[field.key];

    // 1. Auto-generate code when the field is autoCode type and value is absent
    if (field.fieldType === 'autoCode' && !raw) {
      try {
        processed[field.key] = await generateAutoCode(field);
      } catch (e) {
        errors[field.key] = `Failed to generate code for "${field.label}"`;
      }
      continue; // skip further transforms — auto-generated value is already clean
    }

    // 2. Normalize value
    if (raw !== undefined) {
      processed[field.key] = transformValue(field.fieldType, raw);
    }

    // 3. Uniqueness check
    const uniqueErr = await checkUniqueness(field, processed[field.key], companyId, excludeId);
    if (uniqueErr) errors[field.key] = uniqueErr;
  }

  return { processed, errors };
};

module.exports = { runBusinessLogic, generateAutoCode, transformValue };
