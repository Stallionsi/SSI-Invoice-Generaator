const mongoose = require('mongoose');

/**
 * CustomField Schema
 *
 * Stores field DEFINITIONS (not values).
 * Values are stored directly on the entity documents
 * (Invoice, Client, etc.) under a `customFields` object.
 *
 * Soft-delete via deletedAt ensures historical data on
 * existing records is never orphaned.
 */

// ─── Option Sub-schema (for dropdown / radio / multiselect) ──────────────────
const optionSchema = new mongoose.Schema(
  {
    label: { type: String, required: true, trim: true },
    value: { type: String, required: true, trim: true },
    color: { type: String, default: '#6b7280' },
  },
  { _id: false }
);

// ─── Validation Rules Sub-schema ─────────────────────────────────────────────
const validationSchema = new mongoose.Schema(
  {
    min:           { type: Number },
    max:           { type: Number },
    minLength:     { type: Number },
    maxLength:     { type: Number },
    pattern:       { type: String },
    customMessage: { type: String },
    unique:        { type: Boolean, default: false },
  },
  { _id: false }
);

// ─── Condition Sub-schema (one rule in conditional logic) ────────────────────
const conditionSchema = new mongoose.Schema(
  {
    fieldKey: { type: String, required: true },
    operator: {
      type: String,
      required: true,
      enum: ['eq', 'neq', 'contains', 'not_contains', 'gt', 'lt', 'gte', 'lte', 'empty', 'not_empty'],
    },
    value: { type: mongoose.Schema.Types.Mixed },
  },
  { _id: false }
);

// ─── Conditional Logic Sub-schema ────────────────────────────────────────────
const conditionalLogicSchema = new mongoose.Schema(
  {
    enabled:   { type: Boolean, default: false },
    action:    { type: String, enum: ['show', 'hide', 'require'], default: 'show' },
    logicType: { type: String, enum: ['all', 'any'], default: 'all' },
    conditions: [conditionSchema],
  },
  { _id: false }
);

// ─── Main CustomField Schema ──────────────────────────────────────────────────
const customFieldSchema = new mongoose.Schema(
  {
    // ── Ownership ────────────────────────────────────────────────────────────
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },

    // ── Scope ────────────────────────────────────────────────────────────────
    module: {
      type: String,
      required: true,
      enum: ['invoice', 'client', 'payment', 'company', 'lineItem', 'user', 'project'],
      index: true,
    },

    // ── Identity ─────────────────────────────────────────────────────────────
    label: {
      type: String,
      required: [true, 'Field label is required'],
      trim: true,
      maxlength: 100,
    },

    key: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      match: [/^[a-z0-9_]+$/, 'Key must be lowercase alphanumeric with underscores'],
      maxlength: 64,
    },

    // ── Type ──────────────────────────────────────────────────────────────────
    // Open string — no enum restriction so new types can be added without a
    // schema migration. Known built-in types include:
    //   text, textarea, richtext, number, currency, percentage,
    //   date, datetime, email, phone, url,
    //   dropdown, multiselect, radio, checkbox, boolean,
    //   file, address, autoCode, refId,
    //   tags, color, rating, range, json, code, location, reference
    fieldType: {
      type: String,
      required: true,
      default: 'text',
    },

    // ── Type-specific Config ──────────────────────────────────────────────────
    // Flexible key-value bag for each type's settings, e.g.:
    //   range:   { min: 0, max: 100, step: 1 }
    //   rating:  { max: 5 }
    //   file:    { allowedTypes: ['pdf', 'jpg'], maxSize: 5 }
    //   color:   { format: 'hex' }
    config: { type: mongoose.Schema.Types.Mixed, default: {} },

    // ── Auto-Code Configuration ───────────────────────────────────────────────
    autoCodePattern: { type: String, trim: true },
    counter: { type: Number, default: 0 },

    placeholder: { type: String, trim: true, maxlength: 200 },
    helpText:    { type: String, trim: true, maxlength: 500 },
    defaultValue: { type: mongoose.Schema.Types.Mixed },

    // ── Behaviour ─────────────────────────────────────────────────────────────
    isRequired:   { type: Boolean, default: false },
    isReadOnly:   { type: Boolean, default: false },
    isSearchable: { type: Boolean, default: false },
    isActive:     { type: Boolean, default: true },

    // ── Visibility ────────────────────────────────────────────────────────────
    visibility: {
      type: [String],
      enum: ['admin', 'finance', 'employee', 'public'],
      default: ['admin', 'finance', 'employee'],
    },

    // ── Layout ───────────────────────────────────────────────────────────────
    order:   { type: Number, default: 0 },
    section: { type: String, trim: true, default: 'Additional Info' },

    // ── Options (dropdown / radio / multiselect / tags) ───────────────────────
    options: [optionSchema],

    // ── Validation Rules ──────────────────────────────────────────────────────
    validation: { type: validationSchema, default: () => ({}) },

    // ── Conditional Logic ─────────────────────────────────────────────────────
    conditionalLogic: { type: conditionalLogicSchema, default: () => ({ enabled: false }) },

    // ── Audit ─────────────────────────────────────────────────────────────────
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    // ── Soft Delete ───────────────────────────────────────────────────────────
    deletedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
  }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────
customFieldSchema.index({ company: 1, module: 1, key: 1 }, { unique: true });
customFieldSchema.index({ company: 1, module: 1, isActive: 1, order: 1 });

// ─── Virtuals ─────────────────────────────────────────────────────────────────
customFieldSchema.virtual('isDeleted').get(function () {
  return this.deletedAt !== null && this.deletedAt !== undefined;
});

module.exports = mongoose.model('CustomField', customFieldSchema);
