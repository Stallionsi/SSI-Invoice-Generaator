/**
 * One-time migration: seeds InvoiceSequence from existing Invoice data.
 *
 * ── What it does ──────────────────────────────────────────────────────────
 * For each (company + fiscal year) that has existing invoices, creates or
 * updates an InvoiceSequence document so the counter starts from the right
 * number rather than from 1.
 *
 * ── When to run ───────────────────────────────────────────────────────────
 * Run this ONCE before deploying Phase 2 (invoice service integration).
 * Running it after Phase 2 without any invoices created is also safe.
 *
 * ── Idempotency ───────────────────────────────────────────────────────────
 * Uses $max — only updates if the new value is greater than the existing one.
 * Safe to run multiple times. A second run will only increase the counter,
 * never decrease it.
 *
 * ── How current is calculated ─────────────────────────────────────────────
 * For each company + fiscal year:
 *   maxParsed = highest numeric suffix found in existing invoiceNumber strings
 *   count     = total non-cancelled invoices in that period
 *   current   = Math.max(maxParsed, count)
 *
 * Using max(parsed, count) is conservative — it ensures we never reassign
 * a number that was already used, even if invoice numbers were edited manually
 * or the format changed over time.
 *
 * ── Run ───────────────────────────────────────────────────────────────────
 *   node backend/scripts/seedInvoiceSequences.js
 *
 * From the project root. Requires a .env file at backend/.env
 */

require('dotenv').config({
  path: require('path').join(__dirname, '..', '.env'),
});

const mongoose        = require('mongoose');
const Invoice         = require('../src/models/Invoice.model');
const InvoiceSequence = require('../src/models/InvoiceSequence.model');
const { MONGO_URI }   = require('../src/config/env');

// Determines fiscal year from an invoice date.
// Mirrors getFiscalYearKey() in invoiceNumber.util.js.
const fiscalYearFromDate = (date) => {
  const d     = new Date(date);
  const year  = d.getFullYear();
  const month = d.getMonth(); // 0-indexed
  const start = month >= 3 ? year : year - 1;
  return `${start}-${String(start + 1).slice(-2)}`;
};

// Attempts to extract the numeric suffix from an invoice number string.
// Works for formats like:
//   "INV-2026-27-000047"  → 47
//   "SSI/LLC-2026-27-0012" → 12
//   "CUSTOM-001"           → 1
// Returns NaN if the suffix cannot be parsed as a number.
const parseInvoiceNumberSuffix = (invoiceNumber) => {
  if (!invoiceNumber) return NaN;
  const parts = invoiceNumber.split('-');
  const last  = parts[parts.length - 1];
  return parseInt(last, 10);
};

async function run() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGO_URI);
  console.log('Connected.\n');

  // Fetch all non-cancelled invoices — just the fields we need for grouping.
  // Exclude cancelled invoices: they may have been assigned a number that
  // was then voided, so counting them would overstate the sequence.
  const invoices = await Invoice.find(
    { status: { $ne: 'cancelled' } },
    { company: 1, invoiceDate: 1, createdAt: 1, invoiceNumber: 1 },
  ).lean();

  console.log(`Found ${invoices.length} non-cancelled invoices to process.\n`);

  if (invoices.length === 0) {
    console.log('No invoices found — nothing to seed. Exiting.');
    await mongoose.disconnect();
    return;
  }

  // Group invoices by (company + fiscalYear)
  const groups = new Map();

  for (const inv of invoices) {
    const date  = inv.invoiceDate || inv.createdAt;
    const fy    = fiscalYearFromDate(date);
    const key   = `${inv.company.toString()}__${fy}`;

    if (!groups.has(key)) {
      groups.set(key, {
        company:    inv.company,
        fiscalYear: fy,
        count:      0,
        maxParsed:  0,
      });
    }

    const group = groups.get(key);
    group.count++;

    const parsed = parseInvoiceNumberSuffix(inv.invoiceNumber);
    if (!isNaN(parsed) && parsed > group.maxParsed) {
      group.maxParsed = parsed;
    }
  }

  console.log(`Grouped into ${groups.size} (company × fiscal-year) sequences.\n`);

  let seeded = 0;
  let skipped = 0;

  for (const { company, fiscalYear, count, maxParsed } of groups.values()) {
    // Conservative: use the higher of count and the highest parsed number.
    // This handles cases where invoice numbers were manually edited or
    // the format changed mid-year.
    const current = Math.max(count, maxParsed);

    if (current <= 0) {
      skipped++;
      continue;
    }

    // $max ensures we only increase the counter, never decrease it.
    // Safe to run multiple times.
    await InvoiceSequence.findOneAndUpdate(
      { company, fiscalYear },
      { $max: { current } },
      { upsert: true },
    );

    console.log(
      `  ✓ company=${company}  fy=${fiscalYear}  count=${count}  maxParsed=${maxParsed}  → current=${current}`,
    );
    seeded++;
  }

  console.log(`\n── Summary ──────────────────────────────`);
  console.log(`  Seeded:  ${seeded} sequences`);
  console.log(`  Skipped: ${skipped} (current would be ≤ 0)`);
  console.log(`  Total groups: ${groups.size}`);
  console.log(`─────────────────────────────────────────\n`);

  await mongoose.disconnect();
  console.log('Done. MongoDB disconnected.');
}

run().catch((err) => {
  console.error('\nSeed script failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
