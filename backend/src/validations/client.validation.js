const Joi = require('joi');

const addressSchema = Joi.object({
  line1:   Joi.string().trim().allow('', null),
  line2:   Joi.string().trim().allow('', null),
  city:    Joi.string().trim().allow('', null),
  state:   Joi.string().trim().allow('', null),
  pincode: Joi.string().trim().allow('', null),
  zip:     Joi.string().trim().allow('', null),
  country: Joi.string().trim().allow('', null),
});

// Country-specific tax identifier rules.
// Only the fields relevant to the selected country are validated strictly;
// the rest are allowed through (stripped server-side by the service layer).
const taxIdentifiersSchema = Joi.object({
  // India
  gstNumber: Joi.string().trim().uppercase().allow('', null)
    .pattern(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/)
    .message('Invalid GST number format (e.g. 27AAPFU0939F1ZV)'),
  panNumber: Joi.string().trim().uppercase().allow('', null)
    .pattern(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/)
    .message('Invalid PAN number format (e.g. AAPFU0939F)'),
  // United States
  ein: Joi.string().trim().allow('', null)
    .pattern(/^\d{2}-?\d{7}$/)
    .message('Invalid EIN format (e.g. 12-3456789)'),
  ssn: Joi.string().trim().allow('', null),
  stateTaxId: Joi.string().trim().allow('', null),
  // UK / EU / International
  vatNumber: Joi.string().trim().uppercase().allow('', null),
  // Generic fallback
  taxLabel: Joi.string().trim().allow('', null),
  taxValue: Joi.string().trim().allow('', null),
}).allow(null);

const create = Joi.object({
  clientName:      Joi.string().trim().min(2).max(150).required(),
  companyName:     Joi.string().trim().max(200).allow('', null),
  country:         Joi.string().trim().default('India'),
  email:           Joi.string().email().lowercase().allow('', null),
  phone:           Joi.string().trim().allow('', null),
  alternatePhone:  Joi.string().trim().allow('', null),
  billingAddress:  addressSchema.allow(null),
  shippingAddress: addressSchema.allow(null),

  // Structured tax identifiers (new)
  taxIdentifiers: taxIdentifiersSchema,

  // Legacy flat fields — still accepted for backward compatibility
  gstNumber: Joi.string().trim().uppercase().allow('', null),
  panNumber:  Joi.string().trim().uppercase().allow('', null),

  currency:          Joi.string().length(3).uppercase().default('INR'),
  paymentTerms:      Joi.string()
    .valid('Net 15', 'Net 30', 'Net 45', 'Net 60', 'Due on Receipt', 'Custom')
    .default('Net 30'),
  customPaymentDays: Joi.number().integer().min(1).allow(null).default(30),
  notes:        Joi.string().trim().max(500).allow('', null),
  customFields: Joi.object().unknown(true).allow(null).default({}),
});

const update = create.fork(Object.keys(create.describe().keys), (schema) => schema.optional());

module.exports = { create, update };
