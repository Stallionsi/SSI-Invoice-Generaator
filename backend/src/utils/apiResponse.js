/**
 * Standardized API response helpers
 * Every controller uses these to ensure consistent response shape
 */

const success = (res, data = {}, message = 'Success', statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
};

const created = (res, data = {}, message = 'Created successfully') => {
  return success(res, data, message, 201);
};

const paginated = (res, data, pagination, message = 'Success') => {
  return res.status(200).json({
    success: true,
    message,
    data,
    pagination,
  });
};

const error = (res, message = 'Something went wrong', statusCode = 500, errors = null) => {
  const body = { success: false, message };
  if (errors) body.errors = errors;
  return res.status(statusCode).json(body);
};

const notFound = (res, message = 'Resource not found') => error(res, message, 404);
const badRequest = (res, message = 'Bad request', errors = null) => error(res, message, 400, errors);
const unauthorized = (res, message = 'Unauthorized') => error(res, message, 401);
const forbidden = (res, message = 'Forbidden') => error(res, message, 403);
const conflict = (res, message = 'Conflict') => error(res, message, 409);

module.exports = { success, created, paginated, error, notFound, badRequest, unauthorized, forbidden, conflict };
