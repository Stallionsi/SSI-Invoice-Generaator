const invoiceService = require('../services/invoice.service');
const { generateInvoicePdf } = require('../services/pdf.service');
const { previewNextInvoiceNumber } = require('../utils/invoiceNumber.util');
const { success, created, paginated } = require('../utils/apiResponse');
const { asyncHandler } = require('../middlewares/error.middleware');

const create = asyncHandler(async (req, res) => {
  const invoice = await invoiceService.create(req.body, req.companyId, req.user._id);
  created(res, { invoice }, 'Invoice created');
});

const list = asyncHandler(async (req, res) => {
  const { invoices, pagination } = await invoiceService.list(req.companyId, req.query);
  paginated(res, { invoices }, pagination);
});

const getOne = asyncHandler(async (req, res) => {
  const invoice = await invoiceService.getById(req.params.id, req.companyId);
  success(res, { invoice });
});

const update = asyncHandler(async (req, res) => {
  const invoice = await invoiceService.update(req.params.id, req.companyId, req.body);
  success(res, { invoice }, 'Invoice updated');
});

const cancel = asyncHandler(async (req, res) => {
  const invoice = await invoiceService.cancel(req.params.id, req.companyId);
  success(res, {}, 'Invoice deleted');
});

const send = asyncHandler(async (req, res) => {
  console.log('Send API hit', { invoiceId: req.params.id, userId: req.user._id });
  await invoiceService.sendInvoiceEmail(req.params.id, req.companyId, req.body, req.user._id);
  success(res, {}, 'Invoice sent successfully');
});

const markAsSent = asyncHandler(async (req, res) => {
  const invoice = await invoiceService.markAsSent(req.params.id, req.companyId);
  success(res, { invoice }, 'Invoice marked as sent — reminders scheduled');
});

const duplicate = asyncHandler(async (req, res) => {
  const invoice = await invoiceService.duplicate(req.params.id, req.companyId, req.user._id);
  created(res, { invoice }, 'Invoice duplicated');
});

const createCreditNote = asyncHandler(async (req, res) => {
  const creditNote = await invoiceService.createCreditNote(req.params.id, req.companyId, req.user._id);
  created(res, { creditNote }, 'Credit note created');
});

// Public endpoint — client views invoice via unique link
const viewPublic = asyncHandler(async (req, res) => {
  const invoice = await invoiceService.markViewed(req.params.token);
  if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });
  success(res, { invoice });
});
const Invoice = require('../models/Invoice.model');
const fs      = require('fs');
const path    = require('path');

const getPdf = asyncHandler(async (req, res) => {
  const invoice = await Invoice.findOne({ _id: req.params.id, company: req.companyId });
  if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });

  // Always regenerate — ensures template changes are reflected immediately
  // and old cached files (including ImageKit URLs) are never served stale.
  const pdfPath = await generateInvoicePdf(invoice._id);

  const fullPath = path.resolve(pdfPath);
  // Filename format matches the generated file: Invoice_SSI-PAL-2026-27-000002.pdf
  const safeNum  = String(invoice.invoiceNumber).replace(/[/\\:*?"<>|\s]/g, '-');
  const dlName   = `Invoice_${safeNum}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${dlName}"`);
  res.sendFile(fullPath);
});
const getNextNumber = asyncHandler(async (req, res) => {
  const clientId = req.query.clientId || null;
  const seriesId = req.query.seriesId || null;
  const nextNumber = await previewNextInvoiceNumber(req.companyId, clientId, seriesId);
  success(res, { nextNumber });
});

module.exports = { create, list, getOne, update, cancel, send, markAsSent, duplicate, createCreditNote, viewPublic, getPdf, getNextNumber };
