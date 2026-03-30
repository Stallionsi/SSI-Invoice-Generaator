const Client = require('../models/Client.model');
const { processAndValidate } = require('./customField.service');
const { parsePagination, buildPaginationMeta } = require('../utils/pagination.util');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Normalise a phone string into a compact, consistent format.
 *   "+91 7706 957 390"  →  "+917706957390"
 *   "7706957390"        →  "7706957390"
 *   "(022) 2345-6789"   →  "02223456789"
 * Returns undefined when the input is empty so Mongoose omits the field.
 */
const normalizePhone = (phone) => {
  if (!phone) return undefined;
  const s = String(phone).trim();
  const hasPlus = s.startsWith('+');
  const digits  = s.replace(/\D/g, '');
  if (!digits) return undefined;
  return hasPlus ? `+${digits}` : digits;
};

/**
 * Strip address objects that are null or completely empty so Mongoose does not
 * persist a sub-document with only the country default.
 * An address is "empty" when every meaningful field is absent/blank.
 */
const sanitizeAddress = (addr) => {
  if (!addr || typeof addr !== 'object') return undefined;
  const meaningful = ['line1', 'line2', 'city', 'state', 'pincode'];
  const hasContent  = meaningful.some((k) => addr[k] && String(addr[k]).trim());
  return hasContent ? addr : undefined;
};

// Keys allowed per country — MUST match the exact country strings sent by the
// frontend country selector (ClientForm.jsx COUNTRIES array).
const TAX_ID_KEYS_BY_COUNTRY = {
  'India':          ['gstNumber', 'panNumber'],
  'United States':  ['ein', 'ssn', 'stateTaxId'],
  'United Kingdom': ['vatNumber'],
  'Germany':        ['vatNumber'],
  'France':         ['vatNumber'],
  'Australia':      ['taxLabel', 'taxValue'],
  'Canada':         ['taxLabel', 'taxValue'],
  'Singapore':      ['taxLabel', 'taxValue'],
  'UAE':            ['taxLabel', 'taxValue'],
  // 'Other' — no specific keys; generic taxLabel/taxValue preserved by default
};

/**
 * Strip tax identifier fields that don't belong to the client's country.
 * e.g. an India client won't have EIN or VAT stored.
 * Always preserves generic taxLabel/taxValue.
 */
const sanitizeTaxIdentifiers = (taxIdentifiers, country = 'India') => {
  if (!taxIdentifiers || typeof taxIdentifiers !== 'object') return undefined;

  const allSpecificKeys = ['gstNumber', 'panNumber', 'ein', 'ssn', 'stateTaxId', 'vatNumber'];
  const allowed = TAX_ID_KEYS_BY_COUNTRY[country] || [];

  const result = { ...taxIdentifiers };
  for (const key of allSpecificKeys) {
    if (!allowed.includes(key)) delete result[key];
  }

  // Return undefined if nothing meaningful remains
  const hasContent = Object.values(result).some((v) => v !== undefined && v !== null && v !== '');
  return hasContent ? result : undefined;
};

/**
 * Apply phone normalisation and address sanitisation to a raw request body.
 * Mutates `data` in place and returns it.
 */
const sanitizeClientPayload = (data) => {
  if (data.phone)          data.phone          = normalizePhone(data.phone);
  if (data.alternatePhone) data.alternatePhone = normalizePhone(data.alternatePhone);

  const billing  = sanitizeAddress(data.billingAddress);
  const shipping = sanitizeAddress(data.shippingAddress);
  if (billing)  data.billingAddress  = billing;  else delete data.billingAddress;
  if (shipping) data.shippingAddress = shipping; else delete data.shippingAddress;

  // Strip irrelevant tax identifiers based on country
  const sanitized = sanitizeTaxIdentifiers(data.taxIdentifiers, data.country || 'India');
  if (sanitized) data.taxIdentifiers = sanitized; else delete data.taxIdentifiers;

  // Mirror top-level legacy fields from taxIdentifiers for backward compatibility
  if (data.taxIdentifiers) {
    if (data.taxIdentifiers.gstNumber) data.gstNumber = data.taxIdentifiers.gstNumber;
    if (data.taxIdentifiers.panNumber) data.panNumber = data.taxIdentifiers.panNumber;
  }

  return data;
};

const create = async (data, companyId, userId) => {
  // Normalise phones and strip empty address sub-documents.
  sanitizeClientPayload(data);

  // Check duplicate email within same company.
  if (data.email) {
    const existing = await Client.findOne({ company: companyId, email: data.email });
    if (existing) throw Object.assign(new Error('Client with this email already exists'), { statusCode: 409 });
  }

  // Always run the custom field pipeline so autoCode fields are generated
  // and defaults are applied, even when customFields is absent from the payload.
  data.customFields = await processAndValidate(
    'client',
    data.customFields && typeof data.customFields === 'object' ? data.customFields : {},
    companyId,
  );

  return Client.create({ ...data, company: companyId, createdBy: userId });
};

const list = async (companyId, query = {}) => {
  const { page, limit, skip, sort } = parsePagination(query);

  const filter = { company: companyId, isActive: true };
  if (query.search) {
    const escaped = query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(escaped, 'i');
    filter.$or = [
      { clientName:  re },
      { companyName: re },
      { email:       re },
      { phone:       re },
    ];
  }
  if (query.currency) filter.currency = query.currency.toUpperCase();

  const [clients, total] = await Promise.all([
    Client.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    Client.countDocuments(filter),
  ]);

  return { clients, pagination: buildPaginationMeta(total, page, limit) };
};

const getById = async (clientId, companyId) => {
  // '+taxIdentifiers.ssn' overrides select:false so SSN is included for the
  // detail view. We mask it here so the raw value never leaves the server.
  const client = await Client
    .findOne({ _id: clientId, company: companyId })
    .select('+taxIdentifiers.ssn')
    .lean();

  if (!client) throw Object.assign(new Error('Client not found'), { statusCode: 404 });

  // Mask SSN server-side: store last-4 only, e.g. "XXX-XX-6789"
  if (client.taxIdentifiers?.ssn) {
    const digits = client.taxIdentifiers.ssn.replace(/\D/g, '');
    client.taxIdentifiers.ssn = digits.length >= 4
      ? `XXX-XX-${digits.slice(-4)}`
      : 'XXX-XX-****';
  }

  console.log('CLIENT DATA:', JSON.stringify({
    id:             client._id,
    country:        client.country,
    taxIdentifiers: client.taxIdentifiers,
  }, null, 2));

  return client;
};

const update = async (clientId, companyId, data) => {
  // Normalise phones and strip empty address sub-documents.
  sanitizeClientPayload(data);

  // Always run the custom field pipeline (pass clientId to exclude from uniqueness checks).
  data.customFields = await processAndValidate(
    'client',
    data.customFields && typeof data.customFields === 'object' ? data.customFields : {},
    companyId,
    clientId,
  );

  const client = await Client.findOneAndUpdate(
    { _id: clientId, company: companyId },
    data,
    { new: true, runValidators: true }
  );
  if (!client) throw Object.assign(new Error('Client not found'), { statusCode: 404 });
  return client;
};

const remove = async (clientId, companyId) => {
  // Soft delete
  const client = await Client.findOneAndUpdate(
    { _id: clientId, company: companyId },
    { isActive: false },
    { new: true }
  );
  if (!client) throw Object.assign(new Error('Client not found'), { statusCode: 404 });
};

const updateStats = async (clientId, { invoiceDelta = 0, revenueDelta = 0, pendingDelta = 0 }, session = null) => {
  const update = {};
  if (invoiceDelta) update['stats.totalInvoices'] = invoiceDelta;
  if (revenueDelta) update['stats.totalRevenue']  = revenueDelta;
  if (pendingDelta) update['stats.pendingAmount'] = pendingDelta;

  const opts = session ? { session } : {};
  await Client.findByIdAndUpdate(clientId, { $inc: update, $set: { 'stats.lastInvoiceDate': new Date() } }, opts);
};

module.exports = { create, list, getById, update, remove, updateStats };
