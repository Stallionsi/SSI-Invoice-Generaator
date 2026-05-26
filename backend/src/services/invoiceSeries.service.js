'use strict';

const mongoose     = require('mongoose');
const InvoiceSeries   = require('../models/InvoiceSeries.model');
const InvoiceSequence = require('../models/InvoiceSequence.model');
const { getFiscalYearKey } = require('../utils/invoiceNumber.util');

// Escape special regex chars so series prefixes like "SSI/PAL" are matched literally
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ─── List all series for a company (with live stats) ──────────────────────────
//
// Counts invoices by invoice NUMBER PREFIX (not by series ObjectId) so that
// old invoices created before the series system (series=null) are included.
// This gives accurate totals even for series that were created retroactively.
//
const list = async (companyId) => {
  const series = await InvoiceSeries
    .find({ company: companyId })
    .sort({ isDefault: -1, prefix: 1 })
    .populate('client', 'name _id')
    .lean();

  if (!series.length) return [];

  const Invoice = require('../models/Invoice.model');
  const cid = new mongoose.Types.ObjectId(companyId);

  // Count invoices + find last invoice number — both scoped to company and
  // matched by invoice number prefix so old invoices are counted correctly.
  const statsResults = await Promise.all(
    series.map(async (s) => {
      const prefixRe = new RegExp(`^${escapeRegex(s.prefix)}-`, 'i');

      const [total, lastInv] = await Promise.all([
        Invoice.countDocuments({ company: cid, invoiceNumber: { $regex: prefixRe } }),
        Invoice.findOne({ company: cid, invoiceNumber: { $regex: prefixRe } })
          .sort({ createdAt: -1 })
          .select('invoiceNumber')
          .lean(),
      ]);

      // Extract trailing numeric segment from last invoice number
      let lastSequence = 0;
      if (lastInv?.invoiceNumber) {
        const parts = lastInv.invoiceNumber.split('-');
        const num   = parseInt(parts[parts.length - 1], 10);
        if (!isNaN(num)) lastSequence = num;
      }

      return { id: String(s._id), total, lastSequence };
    }),
  );

  const statsMap = Object.fromEntries(statsResults.map((r) => [r.id, r]));

  return series.map((s) => ({
    ...s,
    totalInvoices: statsMap[String(s._id)]?.total        ?? 0,
    lastSequence:  statsMap[String(s._id)]?.lastSequence ?? 0,
  }));
};

// ─── Create ───────────────────────────────────────────────────────────────────

const create = async (companyId, data) => {
  const { prefix, description, isDefault = false, client = null } = data;

  // If this should be default, clear current default first (session not needed — low contention)
  if (isDefault) {
    await InvoiceSeries.updateMany({ company: companyId, isDefault: true }, { isDefault: false });
  }

  const series = await InvoiceSeries.create({
    company:     companyId,
    prefix:      prefix.trim().toUpperCase(),
    description: description?.trim() || undefined,
    client:      client || null,
    isDefault,
    isActive:    true,
  });

  return series.toObject();
};

// ─── Update ───────────────────────────────────────────────────────────────────

const update = async (companyId, seriesId, data) => {
  const series = await InvoiceSeries.findOne({ _id: seriesId, company: companyId });
  if (!series) throw Object.assign(new Error('Series not found'), { statusCode: 404 });

  const { prefix, description, isDefault, isActive, client } = data;

  if (prefix !== undefined)       series.prefix      = prefix.trim().toUpperCase();
  if (description !== undefined)  series.description = description?.trim() || undefined;
  if (isActive !== undefined)     series.isActive    = isActive;
  if ('client' in data)           series.client      = client || null;

  if (isDefault === true && !series.isDefault) {
    // Atomically clear other defaults then set this one
    await InvoiceSeries.updateMany(
      { company: companyId, isDefault: true, _id: { $ne: seriesId } },
      { isDefault: false },
    );
    series.isDefault = true;
  } else if (isDefault === false) {
    series.isDefault = false;
  }

  await series.save();
  return series.toObject();
};

// ─── Set Default ──────────────────────────────────────────────────────────────

const setDefault = async (companyId, seriesId) => {
  const series = await InvoiceSeries.findOne({ _id: seriesId, company: companyId, isActive: true });
  if (!series) throw Object.assign(new Error('Series not found or inactive'), { statusCode: 404 });

  // Clear existing default, then set new one
  await InvoiceSeries.updateMany({ company: companyId, isDefault: true }, { isDefault: false });
  series.isDefault = true;
  await series.save();

  return series.toObject();
};

// ─── Remove ───────────────────────────────────────────────────────────────────

const remove = async (companyId, seriesId) => {
  const Invoice = require('../models/Invoice.model');

  const series = await InvoiceSeries.findOne({ _id: seriesId, company: companyId });
  if (!series) throw Object.assign(new Error('Series not found'), { statusCode: 404 });

  // Prevent deletion if any invoice uses this series
  const inUse = await Invoice.exists({ company: companyId, series: seriesId });
  if (inUse) {
    throw Object.assign(
      new Error('Cannot delete a series that has invoices — deactivate it instead'),
      { statusCode: 409 },
    );
  }

  await series.deleteOne();
  // Also clean up any orphaned sequence counters (no invoices, counter may exist from previews)
  await InvoiceSequence.deleteMany({ company: companyId, series: seriesId });
};

// ─── Get single ───────────────────────────────────────────────────────────────

const getById = async (companyId, seriesId) => {
  const series = await InvoiceSeries.findOne({ _id: seriesId, company: companyId }).lean();
  if (!series) throw Object.assign(new Error('Series not found'), { statusCode: 404 });
  return series;
};

// ─── Get default series for company ───────────────────────────────────────────

const getDefault = async (companyId) => {
  return InvoiceSeries.findOne({ company: companyId, isDefault: true, isActive: true }).lean();
};

module.exports = { list, create, update, setDefault, remove, getById, getDefault };
