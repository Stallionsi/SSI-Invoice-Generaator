const Joi = require('joi');

const MODULES  = ['invoice', 'client', 'payment', 'company', 'lineItem', 'user', 'project'];
// Known built-in types — list is intentionally NOT enforced as an enum so new
// types can be added without deploying a backend change.
// text, textarea, richtext, number, currency, percentage, date, datetime,
// email, phone, url, dropdown, multiselect, radio, checkbox, boolean, file,
// address, autoCode, refId, tags, color, rating, range, json, code, location, reference
const ROLES     = ['admin', 'finance', 'employee', 'public'];
const OPERATORS = ['eq', 'neq', 'contains', 'not_contains', 'gt', 'lt', 'gte', 'lte', 'empty', 'not_empty'];

// ─── Reserved Keys (mirrors customField.service.js RESERVED_KEYS) ─────────────
// Joi-layer guard: reject the request before it even reaches the service.
// The service applies the same check and auto-renames, but a Joi error is a
// cleaner developer-facing signal than a silent rename.
const RESERVED_KEYS_BY_MODULE = {
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

// ─── Sub-schemas ──────────────────────────────────────────────────────────────

const optionSchema = Joi.object({
  label: Joi.string().trim().max(100).required(),
  value: Joi.string().trim().max(100).required(),
  color: Joi.string().trim().max(20).default('#6b7280'),
});

const validationRulesSchema = Joi.object({
  min:           Joi.number(),
  max:           Joi.number().when('min', { is: Joi.exist(), then: Joi.number().min(Joi.ref('min')) }),
  minLength:     Joi.number().integer().min(0),
  maxLength:     Joi.number().integer().min(1),
  pattern:       Joi.string().trim().max(500),
  customMessage: Joi.string().trim().max(300),
  unique:        Joi.boolean().default(false),
});

const conditionSchema = Joi.object({
  fieldKey: Joi.string().trim().required(),
  operator: Joi.string().valid(...OPERATORS).required(),
  value:    Joi.alternatives().try(Joi.string(), Joi.number(), Joi.boolean()).allow(null, ''),
});

const conditionalLogicSchema = Joi.object({
  enabled:    Joi.boolean().default(false),
  action:     Joi.string().valid('show', 'hide', 'require').default('show'),
  logicType:  Joi.string().valid('all', 'any').default('all'),
  conditions: Joi.array().items(conditionSchema).default([]),
});

// ─── Create ───────────────────────────────────────────────────────────────────

const create = Joi.object({
  module:       Joi.string().valid(...MODULES).required(),
  label:        Joi.string().trim().min(1).max(100).required(),
  // key is optional — the service generates it from label when omitted.
  // When provided, we warn early if it clashes with a reserved schema field
  // (the service will auto-suffix it, but a Joi message is a cleaner signal).
  key: Joi.string()
    .trim()
    .lowercase()
    .pattern(/^[a-z0-9_]+$/)
    .max(64)
    .custom((value, helpers) => {
      const module = helpers.state.ancestors[0]?.module;
      const reserved = module ? RESERVED_KEYS_BY_MODULE[module] : null;
      if (reserved && reserved.has(value)) {
        return helpers.error('any.invalid', {
          message: `"${value}" is a reserved schema field for module "${module}". ` +
                   `Use a different key or omit it to let the system auto-generate one.`,
        });
      }
      return value;
    })
    .messages({ 'any.invalid': '{{#message}}' }),
  // fieldType and inputType are aliases — service normalizes inputType → fieldType
  fieldType:    Joi.string().default('text'),
  inputType:    Joi.string(),
  // Flexible type-specific config bag
  config:       Joi.object().unknown(true).default({}),
  placeholder:  Joi.string().trim().max(200).allow(''),
  helpText:     Joi.string().trim().max(500).allow(''),
  defaultValue: Joi.any(),
  isRequired:   Joi.boolean().default(false),
  isReadOnly:   Joi.boolean().default(false),
  isSearchable: Joi.boolean().default(false),
  visibility:   Joi.array().items(Joi.string().valid(...ROLES)).default(['admin', 'finance', 'employee']),
  order:        Joi.number().integer().min(0).default(0),
  section:      Joi.string().trim().max(100).default('Additional Info'),
  options:      Joi.array().items(optionSchema).default([]),
  validation:   validationRulesSchema.default({}),
  conditionalLogic: conditionalLogicSchema.default({}),
});

// ─── Update (all optional) ────────────────────────────────────────────────────

const update = Joi.object({
  label:        Joi.string().trim().min(1).max(100),
  fieldType:    Joi.string(),
  inputType:    Joi.string(),
  config:       Joi.object().unknown(true),
  placeholder:  Joi.string().trim().max(200).allow(''),
  helpText:     Joi.string().trim().max(500).allow(''),
  defaultValue: Joi.any(),
  isRequired:   Joi.boolean(),
  isReadOnly:   Joi.boolean(),
  isSearchable: Joi.boolean(),
  isActive:     Joi.boolean(),
  visibility:   Joi.array().items(Joi.string().valid(...ROLES)),
  order:        Joi.number().integer().min(0),
  section:      Joi.string().trim().max(100),
  options:      Joi.array().items(optionSchema),
  validation:   validationRulesSchema,
  conditionalLogic: conditionalLogicSchema,
});

// ─── Bulk Reorder ─────────────────────────────────────────────────────────────

const reorder = Joi.object({
  module: Joi.string().valid(...MODULES).required(),
  fields: Joi.array()
    .items(
      Joi.object({
        id:    Joi.string().hex().length(24).required(),
        order: Joi.number().integer().min(0).required(),
      })
    )
    .min(1)
    .required(),
});

module.exports = { create, update, reorder };
