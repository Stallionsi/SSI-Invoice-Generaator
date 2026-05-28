/**
 * Pagination utility
 * Builds a consistent pagination object and query options for MongoDB
 */

const DEFAULT_PAGE  = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT     = 9999;

/**
 * Parse pagination params from query string.
 * @returns {{ page, limit, skip, sort }}
 */
const parsePagination = (query = {}) => {
  const page  = Math.max(parseInt(query.page  || DEFAULT_PAGE,  10), 1);
  const limit = Math.min(parseInt(query.limit || DEFAULT_LIMIT, 10), MAX_LIMIT);
  const skip  = (page - 1) * limit;

  // Sort: e.g. ?sort=-createdAt,invoiceDate
  let sort = { createdAt: -1 }; // default
  if (query.sort) {
    sort = {};
    const fields = query.sort.split(',');
    for (const field of fields) {
      if (field.startsWith('-')) {
        sort[field.slice(1)] = -1;
      } else {
        sort[field] = 1;
      }
    }
  }

  return { page, limit, skip, sort };
};

/**
 * Build the pagination metadata object to include in API responses.
 */
const buildPaginationMeta = (total, page, limit) => ({
  total,
  page,
  limit,
  totalPages: Math.ceil(total / limit),
  hasNextPage: page * limit < total,
  hasPrevPage: page > 1,
});

/**
 * Parse common invoice filter params.
 */
const parseInvoiceFilters = (query = {}, companyId) => {
  const filter = { company: companyId };

  if (query.status)   filter.status   = query.status;
  if (query.client)   filter.client   = query.client;
  if (query.currency) filter.currency = query.currency.toUpperCase();

  // Date range on invoiceDate
  if (query.fromDate || query.toDate) {
    filter.invoiceDate = {};
    if (query.fromDate) filter.invoiceDate.$gte = new Date(query.fromDate);
    if (query.toDate)   filter.invoiceDate.$lte = new Date(query.toDate);
  }

  // Due date range
  if (query.dueDateFrom || query.dueDateTo) {
    filter.dueDate = {};
    if (query.dueDateFrom) filter.dueDate.$gte = new Date(query.dueDateFrom);
    if (query.dueDateTo)   filter.dueDate.$lte = new Date(query.dueDateTo);
  }

  // Amount range
  if (query.minAmount || query.maxAmount) {
    filter.grandTotal = {};
    if (query.minAmount) filter.grandTotal.$gte = parseFloat(query.minAmount);
    if (query.maxAmount) filter.grandTotal.$lte = parseFloat(query.maxAmount);
  }

  // Overdue
  if (query.overdue === 'true') {
    filter.status   = { $in: ['sent', 'partial', 'overdue'] };
    filter.dueDate  = { $lt: new Date() };
  }

  // Substring search — regex gives partial/prefix matching that users expect
  // (e.g. typing "INV-202" finds "INV-2026-001"; "$text" only matches full words)
  if (query.search) {
    const escaped = query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(escaped, 'i');
    filter.$or = [
      { invoiceNumber:           re },
      { purchaseOrderNumber:     re },
      { 'recipientDetails.name': re },
      { notes:                   re },
    ];
  }

  return filter;
};

module.exports = { parsePagination, buildPaginationMeta, parseInvoiceFilters };
