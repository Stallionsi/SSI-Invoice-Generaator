/**
 * Custom Field Utilities
 *
 * - Key generation from label
 * - Dynamic value validation engine
 * - Conditional logic evaluator
 */

// ─── Key Generation ───────────────────────────────────────────────────────────

/**
 * Generate a stable, URL-safe key from a human label.
 * e.g. "Bank Reference Number" → "bank_reference_number"
 */
const generateFieldKey = (label) => {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s_]/g, '')   // strip special chars
    .replace(/\s+/g, '_')            // spaces → underscores
    .replace(/_+/g, '_')             // collapse multiple underscores
    .slice(0, 64);
};

// ─── Condition Evaluator ──────────────────────────────────────────────────────

/**
 * Evaluate a single condition against the current form values.
 * @param {Object} condition - { fieldKey, operator, value }
 * @param {Object} allValues - flat object of all current custom field values
 * @returns {boolean}
 */
const evaluateCondition = (condition, allValues) => {
  const actual = allValues[condition.fieldKey];
  const expected = condition.value;

  switch (condition.operator) {
    case 'eq':          return String(actual ?? '') === String(expected ?? '');
    case 'neq':         return String(actual ?? '') !== String(expected ?? '');
    case 'contains':    return String(actual ?? '').toLowerCase().includes(String(expected ?? '').toLowerCase());
    case 'not_contains':return !String(actual ?? '').toLowerCase().includes(String(expected ?? '').toLowerCase());
    case 'gt':          return Number(actual) > Number(expected);
    case 'lt':          return Number(actual) < Number(expected);
    case 'gte':         return Number(actual) >= Number(expected);
    case 'lte':         return Number(actual) <= Number(expected);
    case 'empty':       return actual === null || actual === undefined || actual === '' || (Array.isArray(actual) && actual.length === 0);
    case 'not_empty':   return actual !== null && actual !== undefined && actual !== '' && !(Array.isArray(actual) && actual.length === 0);
    default:            return true;
  }
};

/**
 * Determine if a field is "active" (visible / required) based on its
 * conditional logic rules and the current form state.
 *
 * Returns an object: { visible: boolean, required: boolean }
 *
 * @param {Object} field       - CustomField definition document
 * @param {Object} allValues   - all current custom field values keyed by fieldKey
 */
const evaluateConditionalLogic = (field, allValues = {}) => {
  const logic = field.conditionalLogic;

  // No conditional logic → always visible, respect isRequired setting
  if (!logic || !logic.enabled || !logic.conditions || logic.conditions.length === 0) {
    return { visible: true, required: field.isRequired };
  }

  const results = logic.conditions.map((c) => evaluateCondition(c, allValues));
  const conditionMet = logic.logicType === 'all'
    ? results.every(Boolean)
    : results.some(Boolean);

  switch (logic.action) {
    case 'show':
      return { visible: conditionMet, required: conditionMet && field.isRequired };
    case 'hide':
      return { visible: !conditionMet, required: !conditionMet && field.isRequired };
    case 'require':
      return { visible: true, required: conditionMet };
    default:
      return { visible: true, required: field.isRequired };
  }
};

// ─── Dynamic Value Validator ──────────────────────────────────────────────────

/**
 * Validate a single custom field value against its definition.
 *
 * @param {Object} fieldDef  - CustomField definition document (.lean())
 * @param {*}      value     - the submitted value
 * @param {Object} allValues - all custom field values (for conditional checks)
 * @returns {string|null}    - error message or null if valid
 */
const validateFieldValue = (fieldDef, value, allValues = {}) => {
  // Field was never submitted — skip all validation (including required).
  // Required enforcement is a UX concern handled by the frontend.
  // Only validate values that were explicitly provided (non-undefined).
  if (value === undefined) return null;

  const { visible, required } = evaluateConditionalLogic(fieldDef, allValues);

  // Hidden fields are always skipped
  if (!visible) return null;

  const isEmpty = value === null || value === '' ||
    (Array.isArray(value) && value.length === 0);

  if (required && isEmpty) {
    return fieldDef.validation?.customMessage || `${fieldDef.label} is required`;
  }

  // No further validation if empty and not required
  if (isEmpty) return null;

  const rules = fieldDef.validation || {};

  switch (fieldDef.fieldType) {
    case 'text':
    case 'textarea':
    case 'richtext': {
      const str = String(value);
      if (rules.minLength && str.length < rules.minLength)
        return rules.customMessage || `${fieldDef.label} must be at least ${rules.minLength} characters`;
      if (rules.maxLength && str.length > rules.maxLength)
        return rules.customMessage || `${fieldDef.label} must not exceed ${rules.maxLength} characters`;
      if (rules.pattern && !new RegExp(rules.pattern).test(str))
        return rules.customMessage || `${fieldDef.label} has an invalid format`;
      break;
    }

    case 'number':
    case 'currency':
    case 'percentage': {
      const num = Number(value);
      if (isNaN(num)) return `${fieldDef.label} must be a number`;
      if (rules.min !== undefined && num < rules.min)
        return rules.customMessage || `${fieldDef.label} must be at least ${rules.min}`;
      if (rules.max !== undefined && num > rules.max)
        return rules.customMessage || `${fieldDef.label} must not exceed ${rules.max}`;
      break;
    }

    case 'email': {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value)))
        return rules.customMessage || `${fieldDef.label} must be a valid email address`;
      break;
    }

    case 'phone': {
      if (!/^\+?[\d\s\-().]{6,20}$/.test(String(value)))
        return rules.customMessage || `${fieldDef.label} must be a valid phone number`;
      break;
    }

    case 'url': {
      try {
        new URL(String(value));
      } catch {
        return rules.customMessage || `${fieldDef.label} must be a valid URL`;
      }
      break;
    }

    case 'date':
    case 'datetime': {
      if (isNaN(Date.parse(value)))
        return `${fieldDef.label} must be a valid date`;
      break;
    }

    case 'dropdown':
    case 'radio': {
      const validValues = (fieldDef.options || []).map((o) => o.value);
      if (!validValues.includes(String(value)))
        return `${fieldDef.label} must be one of the allowed options`;
      break;
    }

    case 'multiselect':
    case 'checkbox': {
      if (!Array.isArray(value))
        return `${fieldDef.label} must be an array`;
      const validValues = (fieldDef.options || []).map((o) => o.value);
      const invalid = value.filter((v) => !validValues.includes(String(v)));
      if (invalid.length > 0)
        return `${fieldDef.label} contains invalid options: ${invalid.join(', ')}`;
      break;
    }

    case 'boolean':
      if (typeof value !== 'boolean' && value !== 'true' && value !== 'false' && value !== 0 && value !== 1)
        return `${fieldDef.label} must be true or false`;
      break;

    default:
      break;
  }

  return null;
};

/**
 * Validate ALL custom field values for a given set of field definitions.
 *
 * @param {Array}  fieldDefs  - array of CustomField definition documents
 * @param {Object} values     - submitted customFields object from request body
 * @returns {{ valid: boolean, errors: Object }}
 *   errors is keyed by fieldKey: { "bank_ref": "Bank Reference is required" }
 */
const validateCustomFieldValues = (fieldDefs, values = {}) => {
  const errors = {};

  for (const fieldDef of fieldDefs) {
    const value = values[fieldDef.key];
    const error = validateFieldValue(fieldDef, value, values);
    if (error) {
      errors[fieldDef.key] = error;
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
};

/**
 * Strip any keys from submitted values that don't correspond to an active
 * field definition (prevents injection of arbitrary keys).
 *
 * @param {Array}  fieldDefs  - active CustomField definitions
 * @param {Object} values     - raw submitted customFields
 * @returns {Object}          - sanitized values
 */
const sanitizeCustomFieldValues = (fieldDefs, values = {}) => {
  const allowedKeys = new Set(fieldDefs.map((f) => f.key));
  const sanitized = {};
  for (const [k, v] of Object.entries(values)) {
    if (allowedKeys.has(k)) {
      sanitized[k] = v;
    }
  }
  return sanitized;
};

/**
 * Apply default values for fields that are not present in submitted values.
 *
 * @param {Array}  fieldDefs  - active CustomField definitions
 * @param {Object} values     - submitted customFields
 * @returns {Object}          - values with defaults applied
 */
const applyDefaultValues = (fieldDefs, values = {}) => {
  const result = { ...values };
  for (const fieldDef of fieldDefs) {
    if (result[fieldDef.key] === undefined && fieldDef.defaultValue !== undefined) {
      result[fieldDef.key] = fieldDef.defaultValue;
    }
  }
  return result;
};

/**
 * Filter fields by role visibility.
 *
 * @param {Array}  fieldDefs  - CustomField definitions
 * @param {string} role       - current user role
 * @returns {Array}           - fields visible to this role
 */
const filterByVisibility = (fieldDefs, role) => {
  return fieldDefs.filter((f) => {
    if (!f.visibility || f.visibility.length === 0) return true;
    return f.visibility.includes(role) || f.visibility.includes('public');
  });
};

module.exports = {
  generateFieldKey,
  evaluateCondition,
  evaluateConditionalLogic,
  validateFieldValue,
  validateCustomFieldValues,
  sanitizeCustomFieldValues,
  applyDefaultValues,
  filterByVisibility,
};
