const reportService = require('../services/report.service');
const { success } = require('../utils/apiResponse');
const { asyncHandler } = require('../middlewares/error.middleware');

const revenue = asyncHandler(async (req, res) => {
  const data = await reportService.getRevenueOverview(req.companyId, req.query);
  success(res, data);
});

const pending = asyncHandler(async (req, res) => {
  const data = await reportService.getPendingOverview(req.companyId);
  success(res, data);
});

const clientRevenue = asyncHandler(async (req, res) => {
  const data = await reportService.getClientRevenue(req.companyId, req.query);
  success(res, { clients: data });
});

const taxes = asyncHandler(async (req, res) => {
  const data = await reportService.getTaxReport(req.companyId, req.query);
  success(res, data);
});

const exportCsv = asyncHandler(async (req, res) => {
  const csvContent = await reportService.exportInvoicesCsv(req.companyId, req.query);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="invoices.csv"');
  res.send(csvContent);
});

module.exports = { revenue, pending, clientRevenue, taxes, exportCsv };
