const Invoice = require('../models/Invoice.model');
const Payment = require('../models/Payment.model');
const Client = require('../models/Client.model');
const { v4: uuidv4 } = require('uuid');

// ─── Revenue Overview ──────────────────────────────────────────────────────
const getRevenueOverview = async (companyId, { fromDate, toDate } = {}) => {
  const dateFilter = buildDateFilter(fromDate, toDate);
  const baseFilter = { company: companyId, ...dateFilter };

  const [summary, statusBreakdown, monthlyRevenue] = await Promise.all([
    // Overall totals
    Invoice.aggregate([
      { $match: { ...baseFilter, status: { $ne: 'draft' } } },
      {
        $group: {
          _id: null,
          totalRevenue:     { $sum: '$grandTotal' },
          totalInvoices:    { $count: {} },
          totalPaid:        { $sum: '$amountPaid' },
          totalOutstanding: { $sum: '$balanceDue' },
          avgInvoiceValue:  { $avg: '$grandTotal' },
        },
      },
    ]),

    // By status
    Invoice.aggregate([
      { $match: { company: companyId, ...dateFilter } },
      { $group: { _id: '$status', count: { $count: {} }, total: { $sum: '$grandTotal' } } },
      { $sort: { _id: 1 } },
    ]),

    // Monthly revenue (last 12 months)
    Invoice.aggregate([
      {
        $match: {
          company: companyId,
          status:  { $in: ['paid', 'partial'] },
          invoiceDate: { $gte: new Date(new Date().setMonth(new Date().getMonth() - 11)) },
        },
      },
      {
        $group: {
          _id: { year: { $year: '$invoiceDate' }, month: { $month: '$invoiceDate' } },
          revenue: { $sum: '$amountPaid' },
          count:   { $count: {} },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]),
  ]);

  return {
    summary:        summary[0] || { totalRevenue: 0, totalInvoices: 0, totalPaid: 0, totalOutstanding: 0 },
    statusBreakdown,
    monthlyRevenue,
  };
};

// ─── Pending / Overdue Invoices ────────────────────────────────────────────
const getPendingOverview = async (companyId) => {
  const now = new Date();
  const [pending, overdue, agingBuckets] = await Promise.all([
    Invoice.find({ company: companyId, status: { $in: ['sent', 'viewed', 'partial'] } })
      .populate('client', 'clientName companyName email')
      .sort({ dueDate: 1 })
      .lean(),

    Invoice.find({ company: companyId, status: { $in: ['sent', 'viewed', 'partial', 'overdue'] }, dueDate: { $lt: now } })
      .populate('client', 'clientName email')
      .sort({ dueDate: 1 })
      .lean(),

    // Aging buckets: 0-30, 31-60, 61-90, 90+
    Invoice.aggregate([
      { $match: { company: companyId, status: { $in: ['sent', 'viewed', 'partial', 'overdue'] }, dueDate: { $lt: now } } },
      {
        $addFields: {
          daysOverdue: { $divide: [{ $subtract: [now, '$dueDate'] }, 1000 * 60 * 60 * 24] },
        },
      },
      {
        $bucket: {
          groupBy: '$daysOverdue',
          boundaries: [0, 30, 60, 90],
          default: '90+',
          output: { count: { $count: {} }, totalDue: { $sum: '$balanceDue' } },
        },
      },
    ]),
  ]);

  return { pending, overdue, agingBuckets };
};

// ─── Client-wise Revenue ──────────────────────────────────────────────────
const getClientRevenue = async (companyId, { fromDate, toDate, limit = 10 } = {}) => {
  const dateFilter = buildDateFilter(fromDate, toDate);

  return Invoice.aggregate([
    { $match: { company: companyId, status: { $nin: ['draft', 'cancelled'] }, ...dateFilter } },
    {
      $group: {
        _id:           '$client',
        totalRevenue:  { $sum: '$grandTotal' },
        totalPaid:     { $sum: '$amountPaid' },
        totalDue:      { $sum: '$balanceDue' },
        invoiceCount:  { $count: {} },
        lastInvoice:   { $max: '$invoiceDate' },
      },
    },
    { $sort: { totalRevenue: -1 } },
    { $limit: parseInt(limit) },
    {
      $lookup: {
        from:         'clients',
        localField:   '_id',
        foreignField: '_id',
        as:           'client',
      },
    },
    { $unwind: '$client' },
    {
      $project: {
        clientName:   '$client.clientName',
        companyName:  '$client.companyName',
        email:        '$client.email',
        totalRevenue: 1,
        totalPaid:    1,
        totalDue:     1,
        invoiceCount: 1,
        lastInvoice:  1,
      },
    },
  ]);
};

// ─── Tax Report ────────────────────────────────────────────────────────────
const getTaxReport = async (companyId, { fromDate, toDate } = {}) => {
  const dateFilter = buildDateFilter(fromDate, toDate);

  const result = await Invoice.aggregate([
    { $match: { company: companyId, status: { $nin: ['draft', 'cancelled'] }, ...dateFilter } },
    {
      $group: {
        _id:            null,
        totalTaxable:   { $sum: '$taxableAmount' },
        totalCGST:      { $sum: '$cgstTotal' },
        totalSGST:      { $sum: '$sgstTotal' },
        totalIGST:      { $sum: '$igstTotal' },
        totalCess:      { $sum: '$cessTotal' },
        totalTax:       { $sum: '$taxTotal' },
        totalTDS:       { $sum: '$tdsAmount' },
        invoiceCount:   { $count: {} },
      },
    },
  ]);

  // GST by rate breakdown
  const gstByRate = await Invoice.aggregate([
    { $match: { company: companyId, status: { $nin: ['draft', 'cancelled'] }, ...dateFilter } },
    { $unwind: '$lineItems' },
    {
      $group: {
        _id:          '$lineItems.taxRate',
        taxableAmount: { $sum: '$lineItems.taxableAmount' },
        taxAmount:    { $sum: '$lineItems.taxAmount' },
        count:        { $count: {} },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  return { summary: result[0] || {}, gstByRate };
};

// ─── CSV Export → ImageKit ─────────────────────────────────────────────────
const exportInvoicesCsv = async (companyId, filters = {}) => {
  const dateFilter = buildDateFilter(filters.fromDate, filters.toDate);
  const query = { company: companyId, ...dateFilter };
  if (filters.status) query.status = filters.status;

  const invoices = await Invoice.find(query)
    .populate('client', 'clientName companyName email')
    .sort({ invoiceDate: -1 })
    .lean();

  // Build CSV in memory — no disk writes
  const headers = [
    'Invoice #', 'Invoice Date', 'Due Date', 'Client',
    'Status', 'Subtotal', 'Discount', 'Tax',
    'Grand Total', 'Amount Paid', 'Balance Due', 'Currency',
  ];

  const escape = (v) => {
    const s = String(v ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };

  const rows = invoices.map((inv) => [
    inv.invoiceNumber,
    inv.invoiceDate ? new Date(inv.invoiceDate).toLocaleDateString('en-IN') : '',
    inv.dueDate     ? new Date(inv.dueDate).toLocaleDateString('en-IN')     : '',
    inv.client?.clientName || '',
    inv.status,
    inv.subtotal,
    inv.discountTotal,
    inv.taxTotal,
    inv.grandTotal,
    inv.amountPaid,
    inv.balanceDue,
    inv.currency,
  ].map(escape).join(','));

  const csvContent = [headers.map(escape).join(','), ...rows].join('\r\n');

  return csvContent;
};

// ─── Helper ────────────────────────────────────────────────────────────────
const buildDateFilter = (fromDate, toDate) => {
  if (!fromDate && !toDate) return {};
  const filter = {};
  if (fromDate || toDate) filter.invoiceDate = {};
  if (fromDate) filter.invoiceDate.$gte = new Date(fromDate);
  if (toDate)   filter.invoiceDate.$lte = new Date(toDate);
  return filter;
};

module.exports = { getRevenueOverview, getPendingOverview, getClientRevenue, getTaxReport, exportInvoicesCsv };
