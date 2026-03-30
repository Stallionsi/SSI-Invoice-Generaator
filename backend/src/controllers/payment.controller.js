const paymentService = require('../services/payment.service');
const { success, created, paginated } = require('../utils/apiResponse');
const { asyncHandler } = require('../middlewares/error.middleware');

// Record payment against an invoice
const record = asyncHandler(async (req, res) => {
  const payment = await paymentService.recordPayment(req.params.invoiceId, req.companyId, req.body, req.user._id);
  created(res, { payment }, 'Payment recorded');
});

// List payments for a specific invoice
const listByInvoice = asyncHandler(async (req, res) => {
  const payments = await paymentService.listByInvoice(req.params.invoiceId, req.companyId);
  success(res, { payments });
});

// List all payments for the company
const listAll = asyncHandler(async (req, res) => {
  const { payments, pagination } = await paymentService.listAll(req.companyId, req.query);
  paginated(res, { payments }, pagination);
});

module.exports = { record, listByInvoice, listAll };
