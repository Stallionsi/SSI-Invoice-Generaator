const { badRequest } = require('../utils/apiResponse');

/**
 * Joi validation middleware factory.
 * Validates req.body against the provided Joi schema.
 *
 * Usage:
 *   router.post('/', validate(invoiceValidation.create), controller.create)
 */
const validate = (schema, source = 'body') => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[source], {
      abortEarly: false,      // collect all errors
      allowUnknown: false,    // reject unknown keys
      stripUnknown: true,     // remove unknown keys from value
      convert: true,          // type coercion (strings → numbers etc.)
    });

    if (error) {
      const errors = error.details.map((d) => ({
        field:   d.path.join('.'),
        message: d.message.replace(/['"]/g, ''),
      }));
      return badRequest(res, 'Validation failed', errors);
    }

    // Replace req[source] with sanitized, validated value
    req[source] = value;
    next();
  };
};

/**
 * Validate query params.
 */
const validateQuery = (schema) => validate(schema, 'query');

module.exports = { validate, validateQuery };
