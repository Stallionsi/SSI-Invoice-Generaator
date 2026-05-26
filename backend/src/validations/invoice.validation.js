const Joi = require('joi');

const lineItemSchema = Joi.object({
  description:            Joi.string().trim().min(1).max(500).required(),
  secondLineDescription:  Joi.string().trim().max(500).allow('', null),
  hsnSacCode:             Joi.string().trim().allow('', null),
  quantity:               Joi.number().min(0).required(),
  unit:                   Joi.string().trim().default('Nos'),
  unitPrice:              Joi.number().min(0).required(),
  // Service period date range per line item
  fromDate:               Joi.alternatives().try(Joi.date().iso(), Joi.valid('', null)).default(null),
  toDate:                 Joi.alternatives().try(Joi.date().iso(), Joi.valid('', null)).default(null),
  discount: Joi.object({
    type:  Joi.string().valid('percentage', 'fixed').default('percentage'),
    value: Joi.number().min(0).max(100).default(0),
  }).default({ type: 'percentage', value: 0 }),
  taxRate:  Joi.number().min(0).max(100).default(0),
  cessRate: Joi.number().min(0).max(100).default(0),
});

const customChargeSchema = Joi.object({
  label:  Joi.string().trim().required(),
  amount: Joi.number().min(0).required(),
  taxable: Joi.boolean().default(false),
});

const projectSchema = Joi.object({
  name:        Joi.string().trim().max(200).allow('', null),
  description: Joi.string().trim().max(2000).allow('', null),
  started:     Joi.boolean().default(false),
  // allow '' (empty string from form) as well as null — service layer ignores blank dates
  startDate:   Joi.alternatives().try(Joi.date().iso(), Joi.valid('', null)).default(null),
  endDate:     Joi.alternatives().try(Joi.date().iso(), Joi.valid('', null)).default(null),
}).allow(null);

const create = Joi.object({
  client:              Joi.string().hex().length(24).required(),
  // Optional: links invoice to an InvoiceSeries document.
  // When provided the series prefix is used instead of the company shortCode.
  seriesId:            Joi.string().hex().length(24).allow('', null).default(null),
  invoiceNumber:       Joi.string().trim().max(50).allow('', null), // optional override; auto-generated if omitted
  invoiceDate:         Joi.date().iso().default(() => new Date()),
  dueDate:             Joi.date().iso().allow(null),
  paymentTerms:        Joi.string().valid('Net 15', 'Net 30', 'Net 45', 'Net 60', 'Due on Receipt', 'Custom').default('Net 30'),
  customPaymentDays:   Joi.number().integer().min(0).default(0),
  purchaseOrderNumber: Joi.string().trim().allow('', null),
  referenceNumber:     Joi.string().trim().allow('', null),
  currency:            Joi.string().length(3).uppercase().default('INR'),
  exchangeRate:        Joi.number().min(0).default(1),
  gstType:             Joi.string().valid('intrastate', 'interstate', 'export', 'none').default('intrastate'),
  // Global unit price — single price applied to all line items; individual unitPrices mirror this
  globalUnitPrice:     Joi.number().min(0).allow(null).default(null),
  lineItems:           Joi.array().items(lineItemSchema).min(1).required(),
  invoiceDiscount: Joi.object({
    type:  Joi.string().valid('percentage', 'fixed').default('percentage'),
    value: Joi.number().min(0).default(0),
  }).default({ type: 'percentage', value: 0 }),
  tdsRate:            Joi.number().min(0).max(100).default(0),
  shippingCharge:     Joi.number().min(0).default(0),
  additionalCharges:  Joi.array().items(customChargeSchema).default([]),
  notes:              Joi.string().trim().max(2000).allow('', null),
  termsAndConditions: Joi.string().trim().max(5000).allow('', null),
  internalNotes:      Joi.string().trim().max(2000).allow('', null),
  senderEmail:        Joi.string().email().allow('', null),
  recipientEmail:     Joi.string().email().allow('', null),
  ccEmails:           Joi.array().items(Joi.string().email()).default([]),
  bccEmails:          Joi.array().items(Joi.string().email()).default([]),
  emailMessage:       Joi.string().max(2000).allow('', null),
  template:           Joi.string().default('default'),
  reminderEnabled:    Joi.boolean().default(true),
  isSent:             Joi.boolean().default(false),
  isRecurring:        Joi.boolean().default(false),
  recurringSettings:  Joi.when('isRecurring', {
    is: true,
    then: Joi.object({
      frequency:   Joi.string().valid('weekly', 'monthly', 'quarterly', 'yearly').required(),
      startDate:   Joi.date().iso().required(),
      endDate:     Joi.date().iso().allow(null),
      totalCycles: Joi.number().integer().min(1).allow(null),
    }),
    otherwise: Joi.any().strip(),
  }),
  // Project / engagement metadata
  project: projectSchema,
});

const update = create.fork(
  ['client', 'lineItems'],
  (schema) => schema.optional()
);

const sendEmail = Joi.object({
  recipientEmail: Joi.string().email().required(),
  senderEmail:    Joi.string().email().allow('', null),
  ccEmails:       Joi.array().items(Joi.string().email()).default([]),
  bccEmails:      Joi.array().items(Joi.string().email()).default([]),
  subject:        Joi.string().trim().max(200).allow('', null),
  message:        Joi.string().max(5000).allow('', null),
});

const recordPayment = Joi.object({
  paymentAmount:        Joi.number().min(0.01).required(),
  paymentDate:          Joi.date().iso().default(() => new Date()),
  paymentMethod:        Joi.string().valid(
    'cash', 'bank_transfer', 'upi', 'cheque', 'credit_card', 'debit_card',
    'net_banking', 'neft', 'rtgs', 'imps', 'paypal', 'stripe', 'razorpay', 'other'
  ).required(),
  transactionId:        Joi.string().trim().allow('', null),
  transactionReference: Joi.string().trim().allow('', null),
  notes:                Joi.string().trim().max(500).allow('', null),
  bankAccount:          Joi.string().trim().allow('', null),
  tdsDeducted:          Joi.number().min(0).default(0),
  tdsRate:              Joi.number().min(0).max(100).default(0),
});

module.exports = { create, update, sendEmail, recordPayment };
