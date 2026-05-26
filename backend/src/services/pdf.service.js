'use strict';

const PDFDocument = require('pdfkit');
const fs          = require('fs');
const path        = require('path');
const https       = require('https');
const http        = require('http');
const Invoice     = require('../models/Invoice.model');
const Company     = require('../models/Company.model');
const Client      = require('../models/Client.model');
const logger      = require('../utils/logger');

// ─── Logo loader ──────────────────────────────────────────────────────────────
// Priority: local assets/logo.png → assets/logo.jpg → URL stored in senderDetails.logo
const LOCAL_LOGO_PATHS = [
  path.join(__dirname, '../../assets/logo.png'),
  path.join(__dirname, '../../assets/logo.jpg'),
  path.join(__dirname, '../../assets/logo.jpeg'),
];

/**
 * Returns a Buffer of the logo image, or null if nothing is available.
 * Tries local files first, then downloads from URL (DB-stored ImageKit/CDN link).
 */
const loadLogoBuffer = async (urlFromDb) => {
  // 1. Local file
  for (const p of LOCAL_LOGO_PATHS) {
    if (fs.existsSync(p)) {
      try { return fs.readFileSync(p); } catch (_) {}
    }
  }

  // 2. Remote URL stored in DB (e.g. company logo uploaded via dashboard)
  if (urlFromDb && urlFromDb.startsWith('http')) {
    return new Promise((resolve) => {
      const client = urlFromDb.startsWith('https') ? https : http;
      client.get(urlFromDb, { timeout: 8000 }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', () => resolve(null));
      }).on('error', () => resolve(null))
        .on('timeout', function () { this.destroy(); resolve(null); });
    });
  }

  return null;
};

// ─── Local storage ────────────────────────────────────────────────────────────
const PDFS_DIR  = path.join(__dirname, '../../uploads/pdfs');
const ensureDir = () => { if (!fs.existsSync(PDFS_DIR)) fs.mkdirSync(PDFS_DIR, { recursive: true }); };

// ─── Page constants ───────────────────────────────────────────────────────────
const M      = 40;         // left/right margin
const PW     = 595.28;     // A4 width  (points)
const PH     = 841.89;     // A4 height (points)
const CW     = PW - M * 2; // content width = 515.28
const R      = PW - M;     // right edge   = 555.28
const FOOT_H = 58;         // footer bar height reserved at bottom

// ─── Colors ───────────────────────────────────────────────────────────────────
const NAVY   = '#0f2744';
const BLUE   = '#1d6fd8';
const BODY   = '#374151';
const GRAY   = '#64748b';
const WHITE  = '#ffffff';
const BORD   = '#e2e8f0';
const BGLT   = '#f8faff';
const AMBER  = '#d97706';
const AMBG   = '#fffbeb';
const GREEN  = '#059669';
const RED    = '#dc2626';

// ─── Formatting helpers ───────────────────────────────────────────────────────
const safe = (s) => String(s ?? '');

// Use Indian grouping (1,00,000) for INR; standard grouping (1,000) for other currencies.
const fmt = (n, currency = 'INR') =>
  Number(n || 0).toLocaleString(currency === 'INR' ? 'en-IN' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const fmtDate = (d) => {
  if (!d) return '\u2014';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '\u2014';
  return `${dt.getDate()} ${MONTHS[dt.getMonth()]} ${dt.getFullYear()}`;
};

/**
 * Format a line-item date in country-appropriate short form.
 * INR / India  \u2192 DD/MM/YYYY
 * USD / others \u2192 MM/DD/YYYY
 */
const fmtLineItemDate = (d, currency = 'INR') => {
  if (!d) return null;
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return null;
  const dd   = String(dt.getDate()).padStart(2, '0');
  const mm   = String(dt.getMonth() + 1).padStart(2, '0');
  const yyyy = dt.getFullYear();
  return currency === 'INR' ? `${dd}/${mm}/${yyyy}` : `${mm}/${dd}/${yyyy}`;
};

// PDFKit built-in fonts (Helvetica) support Latin-1; use Rs. for INR, £ for GBP.
const currSym = (c) =>
  ({ INR: 'Rs.', USD: '$', EUR: 'EUR', GBP: '\u00A3' }[c] || (String(c || 'Rs.')));

const cur = (currency, n) => `${currSym(currency)} ${fmt(n, currency)}`;

const trunc = (s, max) => {
  const str = safe(s);
  return str.length > max ? str.slice(0, max - 1) + '\u2026' : str;
};

// ─── Number to words ──────────────────────────────────────────────────────────
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight',
  'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

const three = (n) => {
  if (n === 0) return '';
  if (n < 20)  return ONES[n];
  if (n < 100) return `${TENS[Math.floor(n / 10)]}${n % 10 ? ' ' + ONES[n % 10] : ''}`;
  return `${ONES[Math.floor(n / 100)]} Hundred${n % 100 ? ' ' + three(n % 100) : ''}`;
};

const numToWords = (amount, currency = 'INR') => {
  const n = Math.round(Math.abs(amount || 0));
  if (n === 0) return 'Zero Only';
  const word = { INR: 'Rupees', USD: 'Dollars', EUR: 'Euros', GBP: 'Pounds' }[currency] || currency;
  const parts = [];
  const cr   = Math.floor(n / 1e7);
  const lakh = Math.floor((n % 1e7) / 1e5);
  const thou = Math.floor((n % 1e5) / 1e3);
  const rest = n % 1e3;
  if (cr)   parts.push(`${three(cr)} Crore`);
  if (lakh) parts.push(`${three(lakh)} Lakh`);
  if (thou) parts.push(`${three(thou)} Thousand`);
  if (rest) parts.push(three(rest));
  return `${word}: ${parts.join(' ')} Only`;
};

// ─── Low-level draw helpers ───────────────────────────────────────────────────
const fillRect = (doc, x, y, w, h, color) =>
  doc.rect(x, y, w, h).fill(color);

const strokeRect = (doc, x, y, w, h, color = BORD, lw = 0.5) =>
  doc.rect(x, y, w, h).strokeColor(color).lineWidth(lw).stroke();

const hLine = (doc, y, x1 = M, x2 = R, color = BORD) =>
  doc.moveTo(x1, y).lineTo(x2, y).strokeColor(color).lineWidth(0.5).stroke();

// Check if y is too close to the footer; add a page if so.
const checkPage = (doc, y, needed = 60) => {
  if (y + needed > PH - FOOT_H - 10) {
    doc.addPage({ size: 'A4', margin: 0 });
    return M;
  }
  return y;
};

// ─── Section: HEADER ─────────────────────────────────────────────────────────
// drawHeader is async because it may download the logo from a remote URL.
const drawHeader = async (doc, invoice, company, logoBuffer) => {
  const sender = invoice.senderDetails || {};
  let   y      = M;
  let   textX  = M;

  // ── Logo (left side) ─────────────────────────────────────────────────────
  // Generous box so the StallionSI wide logo renders clearly.
  // PDFKit preserves aspect ratio with `fit` — image is never stretched.
  const LOGO_W   = 300;
  const LOGO_H   = 110;
  const HEADER_H = 140;
  const LOGO_X   = 10;   // flush to top-left corner of the page
  const LOGO_Y   = 10;

  if (logoBuffer && logoBuffer.length > 0) {
    try {
      doc.image(logoBuffer, LOGO_X, LOGO_Y, { fit: [LOGO_W, LOGO_H], align: 'left', valign: 'top' });
    } catch (err) {
      logger.warn(`[pdf] Could not embed logo: ${err.message}`);
    }
  }

  // ── Company info — name/tagline as text fallback when no logo ────────────
  const compName = safe(sender.name || company?.companyName || 'Company');
  if (!logoBuffer) {
    doc.font('Helvetica-Bold').fontSize(15).fillColor(NAVY)
      .text(compName, M, y + 8, { width: 230, lineBreak: false });
    doc.font('Helvetica').fontSize(8.5).fillColor(GRAY)
      .text('Driving Innovation, Delivering Excellence', M, y + 28, { width: 230, lineBreak: false });
  }

  // GSTIN + contact sit below the logo block (logo starts at LOGO_Y)
  let infoY = logoBuffer ? LOGO_Y + LOGO_H + 2 : y + 50;
  if (sender.gstNumber) {
    doc.font('Helvetica').fontSize(8).fillColor(GRAY)
      .text(`GSTIN: ${safe(sender.gstNumber)}`, M, infoY, { width: 250, lineBreak: false });
    infoY += 12;
  }
  if (sender.email || sender.phone) {
    const contact = [sender.email, sender.phone].filter(Boolean).join('  |  ');
    doc.font('Helvetica').fontSize(8).fillColor(GRAY)
      .text(contact, M, infoY, { width: 250, lineBreak: false });
  }

  // ── Right side: INVOICE label + number + status ───────────────────────────
  const label = invoice.isCreditNote ? 'CREDIT NOTE' : 'INVOICE';
  doc.font('Helvetica-Bold').fontSize(28).fillColor(NAVY)
    .text(label, M, y, { width: CW, align: 'right', lineBreak: false });

  doc.font('Helvetica').fontSize(11).fillColor(GRAY)
    .text(`# ${safe(invoice.invoiceNumber)}`, M, y + 38, { width: CW, align: 'right', lineBreak: false });


  return y + HEADER_H;
};

// ─── Section: ACCENT BAR ─────────────────────────────────────────────────────
const drawAccentBar = (doc, y) => {
  fillRect(doc, 0, y, PW, 4, NAVY);
  return y + 4;
};

// ─── Section: META STRIP (dates, PO, terms, amount) ──────────────────────────
const drawMetaStrip = (doc, invoice, y) => {
  const H = 50;
  fillRect(doc, 0, y, PW, H, BGLT);

  const isOverdue = invoice.dueDate && new Date(invoice.dueDate) < new Date()
    && !['paid', 'cancelled'].includes(invoice.status);

  // paymentTerms may be a string enum ('Net 30'), a legacy number (30), or 'Custom'
  const termsRaw   = invoice.paymentTerms;
  let termsValue = null;
  if (termsRaw) {
    if (typeof termsRaw === 'number') {
      termsValue = `Net ${termsRaw}`;
    } else if (termsRaw === 'Custom') {
      if (invoice.customPaymentDays > 0) {
        termsValue = `Net ${invoice.customPaymentDays}`;
      } else if (invoice.dueDate && invoice.invoiceDate) {
        // Fallback: derive days from the stored dates (covers invoices created before customPaymentDays was added)
        const days = Math.round(
          (new Date(invoice.dueDate) - new Date(invoice.invoiceDate)) / (1000 * 60 * 60 * 24)
        );
        termsValue = days > 0 ? `Net ${days}` : null;
      }
    } else {
      termsValue = safe(termsRaw);
    }
  }

  const cards = [
    { label: 'Dated',        value: fmtDate(invoice.invoiceDate) },
    { label: 'Due Date',     value: fmtDate(invoice.dueDate), overdue: isOverdue },
    invoice.purchaseOrderNumber ? { label: 'PO Number',  value: safe(invoice.purchaseOrderNumber) } : null,
    invoice.poDate              ? { label: 'PO Date',    value: fmtDate(invoice.poDate) }             : null,
    termsValue                  ? { label: 'Net Terms',  value: termsValue }                        : null,
    { label: 'Amount Due', value: cur(invoice.currency, invoice.balanceDue ?? invoice.grandTotal), bold: true },
  ].filter(Boolean);

  const cardW = CW / cards.length;
  cards.forEach((card, i) => {
    const cx = M + i * cardW;
    if (i > 0) {
      doc.moveTo(cx, y + 10).lineTo(cx, y + H - 10)
        .strokeColor(BORD).lineWidth(0.5).stroke();
    }
    doc.font('Helvetica').fontSize(7.5).fillColor(GRAY)
      .text(card.label, cx + 8, y + 10, { width: cardW - 16, lineBreak: false });

    const valColor = card.overdue ? RED : card.bold ? AMBER : NAVY;
    const valFont  = card.bold ? 'Helvetica-Bold' : 'Helvetica-Bold';
    doc.font(valFont).fontSize(9.5).fillColor(valColor)
      .text(card.value, cx + 8, y + 26, { width: cardW - 16, lineBreak: false });
  });

  return y + H;
};

// ─── Section: PARTIES (From + Bill To) ───────────────────────────────────────
const drawParties = (doc, invoice, y) => {
  y += 14;
  const sender    = invoice.senderDetails    || {};
  const recipient = invoice.recipientDetails || {};
  const colW  = (CW - 20) / 2;
  const leftX  = M;
  const rightX = M + colW + 20;
  let leftY    = y;
  let rightY   = y;

  // FROM column
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(BLUE)
    .text('FROM', leftX, leftY, { width: colW, lineBreak: false });
  leftY += 14;

  doc.font('Helvetica-Bold').fontSize(11).fillColor(NAVY)
    .text(trunc(sender.name, 38), leftX, leftY, { width: colW, lineBreak: false });
  leftY += 16;

  // Address stored as \n-separated lines (line1 / city,state / pincode,country).
  // Older invoices that stored a flat comma-joined string render as a single line.
  const addressLines = sender.address
    ? sender.address.split('\n').map((l) => l.trim()).filter(Boolean)
    : [];
  const senderLines = [
    ...addressLines,
    sender.email,
    sender.phone,
    sender.website || null,
    sender.panNumber ? `PAN: ${sender.panNumber}` : null,
  ].filter(Boolean);
  senderLines.forEach((line) => {
    const isWebsite = line === sender.website && line;
    // Ensure URL has a scheme so PDFKit creates a valid hyperlink
    const href = isWebsite
      ? (line.startsWith('http') ? line : `https://${line}`)
      : null;
    doc.font('Helvetica').fontSize(8.5).fillColor(isWebsite ? BLUE : BODY)
      .text(safe(line), leftX, leftY, { width: colW, lineBreak: false, ...(href ? { link: href, underline: true } : {}) });
    leftY += 12;
  });

  // BILL TO column
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(BLUE)
    .text('BILL TO', rightX, rightY, { width: colW, lineBreak: false });
  rightY += 14;

  doc.font('Helvetica-Bold').fontSize(11).fillColor(NAVY)
    .text(trunc(recipient.name, 38), rightX, rightY, { width: colW, lineBreak: false });
  rightY += 16;

  if (recipient.companyName) {
    doc.font('Helvetica-Bold').fontSize(9).fillColor(BODY)
      .text(trunc(recipient.companyName, 40), rightX, rightY, { width: colW, lineBreak: false });
    rightY += 13;
  }
  // Split \n-formatted address into individual lines; old flat strings render as one line.
  const billAddrLines = recipient.billingAddress
    ? recipient.billingAddress.split('\n').map((l) => l.trim()).filter(Boolean)
    : [];
  const recipientLines = [
    ...billAddrLines,
    recipient.gstNumber ? `GSTIN: ${recipient.gstNumber}` : null,
  ].filter(Boolean);
  recipientLines.forEach((line) => {
    doc.font('Helvetica').fontSize(8.5).fillColor(BODY)
      .text(safe(line), rightX, rightY, { width: colW, lineBreak: false });
    rightY += 12;
  });

  const nextY = Math.max(leftY, rightY) + 12;
  hLine(doc, nextY);
  return nextY + 12;
};

// ─── Section: PROJECT / ENGAGEMENT DETAILS ───────────────────────────────────
const drawProject = (doc, invoice, y) => {
  const project = invoice.project;
  if (!project || !safe(project.name).trim()) return y;

  const name        = safe(project.name).trim();
  const description = project.description ? safe(project.description).trim() : '';
  const hasDates    = project.startDate || project.endDate;
  const hasStarted  = project.started === true;

  // Estimate body height for checkPage
  let bodyH = 10 + 18; // top padding + name row
  if (description) {
    doc.font('Helvetica').fontSize(8.5);
    bodyH += doc.heightOfString(description, { width: CW - 24 }) + 8;
  }
  if (hasDates)  bodyH += 26;
  bodyH += 10; // bottom padding

  y = checkPage(doc, y, 18 + bodyH + 14);

  // Header bar
  fillRect(doc, M, y, CW, 18, '#dbeafe');
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(BLUE)
    .text('PROJECT / ENGAGEMENT', M + 12, y + 5, { lineBreak: false });
  y += 18;

  fillRect(doc, M, y, CW, bodyH, BGLT);
  strokeRect(doc, M, y - 18, CW, bodyH + 18, '#bfdbfe');

  let ty = y + 10;

  // Project name on the left; "● Started" badge on the right (if started)
  doc.font('Helvetica-Bold').fontSize(11).fillColor(NAVY);
  const nameW = doc.widthOfString(name);
  doc.text(name, M + 12, ty, { lineBreak: false });
  if (hasStarted) {
    const badgeX = M + 12 + nameW + 10;
    if (badgeX + 60 < R - 12) {
      doc.font('Helvetica').fontSize(8).fillColor(GREEN)
        .text('● Started', badgeX, ty + 2, { lineBreak: false });
    } else {
      // Name too long — put badge right-aligned
      doc.font('Helvetica').fontSize(8).fillColor(GREEN)
        .text('● Started', M, ty + 2, { width: CW - 12, align: 'right', lineBreak: false });
    }
  }
  ty += 18;

  if (description) {
    doc.font('Helvetica').fontSize(8.5).fillColor(BODY)
      .text(description, M + 12, ty, { width: CW - 24 });
    doc.font('Helvetica').fontSize(8.5);
    ty += doc.heightOfString(description, { width: CW - 24 }) + 8;
  }

  if (hasDates) {
    const colW = (CW - 24) / 2;
    if (project.startDate) {
      doc.font('Helvetica').fontSize(7.5).fillColor(GRAY)
        .text('Start Date', M + 12, ty, { width: colW, lineBreak: false });
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(NAVY)
        .text(fmtDate(project.startDate), M + 12, ty + 11, { width: colW, lineBreak: false });
    }
    if (project.endDate) {
      const col2X = M + 12 + colW;
      doc.font('Helvetica').fontSize(7.5).fillColor(GRAY)
        .text('End Date', col2X, ty, { width: colW, lineBreak: false });
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(NAVY)
        .text(fmtDate(project.endDate), col2X, ty + 11, { width: colW, lineBreak: false });
    }
  }

  return y + bodyH + 14;
};

// ─── Section: ITEMS TABLE ─────────────────────────────────────────────────────
// Column layout (total = 515 = CW)
const COLS = [
  { label: '#',           x: M,       w: 22,  align: 'left'   },
  { label: 'Description', x: M + 22,  w: 268, align: 'left'   },
  { label: 'Qty',         x: M + 290, w: 35,  align: 'right'  },
  { label: 'Rate',        x: M + 325, w: 60,  align: 'right'  },
  { label: 'Tax',         x: M + 385, w: 40,  align: 'center' },
  { label: 'Amount',      x: M + 425, w: 90,  align: 'right'  },
];

const drawItemsTable = (doc, invoice, y) => {
  // Section heading
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(BLUE)
    .text('ITEMS & SERVICES', M, y, { lineBreak: false });
  y += 13;

  const ROW_H  = 23;
  const currency = invoice.currency || 'INR';

  // Header row
  fillRect(doc, M, y, CW, ROW_H, NAVY);
  doc.font('Helvetica-Bold').fontSize(8).fillColor(WHITE);
  COLS.forEach((c) => {
    doc.text(c.label, c.x + 4, y + 8, { width: c.w - 8, align: c.align, lineBreak: false });
  });
  y += ROW_H;

  // Data rows — pre-measure ALL rows first to get a uniform height across the table
  const CELL_PAD = 4;
  const PAD_TOP  = 8;
  const PAD_BOT  = 8;
  const MIN_ROW  = 28;
  const DESC_X   = COLS[1].x + CELL_PAD;
  const DESC_W   = COLS[1].w - CELL_PAD * 2;  // 220pt

  // Pass 1: measure each row so all rows share the tallest height
  const lineItems = invoice.lineItems || [];
  let uniformRowH = MIN_ROW;
  const measurements = lineItems.map((item) => {
    const desc = safe(item.description);

    // Build subline: prefer secondLineDescription; otherwise compose from date range
    let subline = item.secondLineDescription ? safe(item.secondLineDescription) : null;
    if (!subline && item.fromDate && item.toDate) {
      const f = fmtLineItemDate(item.fromDate, currency);
      const t = fmtLineItemDate(item.toDate,   currency);
      if (f && t) subline = `${f}  –  ${t}`;
    } else if (!subline && item.fromDate) {
      const f = fmtLineItemDate(item.fromDate, currency);
      if (f) subline = `From: ${f}`;
    }

    doc.font('Helvetica-Bold').fontSize(8.5);
    // Single-line height only — descriptions are rendered on one line (no wrap)
    const descH = doc.heightOfString('A', { width: 10000 });

    doc.font('Helvetica').fontSize(7.5);
    const subH = subline ? doc.heightOfString(subline, { width: DESC_W }) + 2 : 0;

    const h = Math.max(MIN_ROW, Math.ceil(descH + subH) + PAD_TOP + PAD_BOT);
    if (h > uniformRowH) uniformRowH = h;
    return { desc, subline, descH };
  });

  // Pass 2: render every row at uniformRowH
  measurements.forEach(({ desc, subline, descH }, i) => {
    const item = lineItems[i];

    y = checkPage(doc, y, uniformRowH + 10);
    fillRect(doc, M, y, CW, uniformRowH, i % 2 === 0 ? BGLT : WHITE);

    const centerY  = y + Math.round((uniformRowH - 9) / 2);
    const descTopY = y + PAD_TOP;

    // # column
    doc.font('Helvetica-Bold').fontSize(8).fillColor(NAVY)
      .text(String(i + 1), COLS[0].x + CELL_PAD, centerY, { width: COLS[0].w - CELL_PAD * 2, align: 'left', lineBreak: false });

    // Description — single line, no wrap
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(NAVY)
      .text(desc, DESC_X, descTopY, { width: DESC_W, lineBreak: false });
    if (subline) {
      const subY = descTopY + Math.ceil(descH) + 2;
      doc.font('Helvetica').fontSize(7.5).fillColor(GRAY)
        .text(subline, DESC_X, subY, { width: DESC_W, lineBreak: true });
    }

    // Qty
    doc.font('Helvetica').fontSize(8.5).fillColor(BODY)
      .text(fmt(item.quantity), COLS[2].x + CELL_PAD, centerY, { width: COLS[2].w - CELL_PAD * 2, align: 'right', lineBreak: false });

    // Rate
    doc.font('Helvetica').fontSize(8.5).fillColor(BODY)
      .text(cur(currency, item.unitPrice), COLS[3].x + CELL_PAD, centerY, { width: COLS[3].w - CELL_PAD * 2, align: 'right', lineBreak: false });

    // Tax rate \u2014 show dash for USD/tax-free invoices
    const taxLabel = item.taxRate > 0 ? `${item.taxRate}%` : '\u2014';
    doc.font('Helvetica').fontSize(8).fillColor(GRAY)
      .text(taxLabel, COLS[4].x + CELL_PAD, centerY, { width: COLS[4].w - CELL_PAD * 2, align: 'center', lineBreak: false });

    // Amount
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(NAVY)
      .text(cur(currency, item.amount), COLS[5].x + CELL_PAD, centerY, { width: COLS[5].w - CELL_PAD * 2, align: 'right', lineBreak: false });

    y += uniformRowH;
  });

  // Footer summary row
  const FH = 20;
  fillRect(doc, M, y, CW, FH, '#eef2f8');
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(NAVY)
    .text(`${(invoice.lineItems || []).length} item(s)`, COLS[1].x + 4, y + 6, { width: 100, lineBreak: false });
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(NAVY)
    .text(cur(currency, invoice.subtotal), COLS[5].x + 4, y + 6, { width: COLS[5].w - 8, align: 'right', lineBreak: false });
  y += FH;

  return y;
};

// ─── Section: TOTALS BOX ─────────────────────────────────────────────────────
const drawTotals = (doc, invoice, y) => {
  y += 14;
  const currency = invoice.currency || 'INR';
  const isINR    = currency === 'INR';
  const BOX_W   = 240;
  const BOX_X   = R - BOX_W;
  const ROW_H   = 22;

  // ── Normalise tax breakdown ─────────────────────────────────────────
  // gstType === 'none'  → no tax lines at all (covers USD/international invoices).
  // non-INR with tax    → collapse CGST/SGST entries into a single generic "Tax" line.
  // INR                 → show full breakdown from taxBreakdown[].
  let taxBreakdownRows;
  if (invoice.gstType === 'none') {
    taxBreakdownRows = [];
  } else if (!isINR) {
    const foreignTaxTotal = (invoice.taxBreakdown || []).reduce((sum, tb) => sum + (tb.taxAmount || 0), 0)
      || (invoice.taxTotal || 0);
    taxBreakdownRows = foreignTaxTotal > 0
      ? [{ taxName: 'Tax', taxAmount: foreignTaxTotal }]
      : [];
  } else {
    taxBreakdownRows = invoice.taxBreakdown || [];
  }

  // Build rows — Subtotal is only shown when there are additional lines below it
  // (discount, tax, shipping, TDS). If nothing else appears, showing Subtotal == Grand Total
  // is redundant and clutters the box.
  const rows = [];

  if (invoice.discountTotal > 0) {
    rows.push({ label: 'Discount', value: `- ${cur(currency, invoice.discountTotal)}`, color: GREEN });
  }
  if (invoice.taxableAmount && invoice.taxableAmount !== invoice.subtotal) {
    rows.push({ label: 'Taxable Amount', value: cur(currency, invoice.taxableAmount), color: BODY });
  }
  taxBreakdownRows.forEach((tb) => {
    if (tb.taxAmount > 0) {
      rows.push({ label: safe(tb.taxName), value: cur(currency, tb.taxAmount), color: GRAY });
    }
  });
  if (invoice.taxTotal > 0 && !taxBreakdownRows.length) {
    rows.push({ label: 'Tax', value: cur(currency, invoice.taxTotal), color: GRAY });
  }

  // Prepend Subtotal only when there is at least one other breakdown row
  if (rows.length > 0) {
    rows.unshift({ label: 'Subtotal', value: cur(currency, invoice.subtotal), color: BODY });
  }
  if (invoice.shippingCharge > 0) {
    rows.push({ label: 'Shipping', value: cur(currency, invoice.shippingCharge), color: BODY });
  }
  if (invoice.tdsAmount > 0) {
    rows.push({ label: `TDS (${invoice.tdsRate}%)`, value: `- ${cur(currency, invoice.tdsAmount)}`, color: RED });
  }

  // Calculate total box height
  const bodyH  = rows.length * ROW_H;
  const gtH    = 28;
  const paidH  = invoice.amountPaid > 0 ? ROW_H : 0;
  const balH   = (invoice.balanceDue ?? invoice.grandTotal) > 0 ? ROW_H : 0;
  const boxH   = bodyH + gtH + paidH + balH;

  y = checkPage(doc, y, boxH + 20);

  // Outer border
  strokeRect(doc, BOX_X, y, BOX_W, boxH);

  // Detail rows
  rows.forEach((row, i) => {
    const ry = y + i * ROW_H;
    if (i > 0) hLine(doc, ry, BOX_X, R, '#eef2f9');
    doc.font('Helvetica').fontSize(9).fillColor(GRAY)
      .text(row.label, BOX_X + 12, ry + 7, { width: 110, lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(9).fillColor(row.color)
      .text(row.value, BOX_X + 12, ry + 7, { width: BOX_W - 24, align: 'right', lineBreak: false });
  });

  // Grand Total
  let gy = y + bodyH;
  fillRect(doc, BOX_X, gy, BOX_W, gtH, NAVY);
  doc.font('Helvetica-Bold').fontSize(11).fillColor(WHITE)
    .text('Grand Total', BOX_X + 12, gy + 9, { width: 110, lineBreak: false });
  doc.font('Helvetica-Bold').fontSize(11).fillColor(WHITE)
    .text(cur(currency, invoice.grandTotal), BOX_X + 12, gy + 9, { width: BOX_W - 24, align: 'right', lineBreak: false });
  gy += gtH;

  // Amount Paid
  if (invoice.amountPaid > 0) {
    fillRect(doc, BOX_X, gy, BOX_W, ROW_H, '#f0fdf4');
    doc.font('Helvetica').fontSize(9).fillColor(GREEN)
      .text('Amount Paid', BOX_X + 12, gy + 7, { width: 110, lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(9).fillColor(GREEN)
      .text(cur(currency, invoice.amountPaid), BOX_X + 12, gy + 7, { width: BOX_W - 24, align: 'right', lineBreak: false });
    gy += ROW_H;
  }

  // Balance Due
  const balanceDue = invoice.balanceDue ?? invoice.grandTotal;
  if (balanceDue > 0) {
    fillRect(doc, BOX_X, gy, BOX_W, ROW_H, AMBG);
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(AMBER)
      .text('Balance Due', BOX_X + 12, gy + 7, { width: 110, lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(11.5).fillColor(AMBER)
      .text(cur(currency, balanceDue), BOX_X + 12, gy + 6, { width: BOX_W - 24, align: 'right', lineBreak: false });
    gy += ROW_H;
  }

  return gy + 14;
};

// ─── Section: AMOUNT IN WORDS ─────────────────────────────────────────────────
const drawAmountWords = (doc, invoice, y) => {
  y = checkPage(doc, y, 34);
  const words = numToWords(invoice.grandTotal || 0, invoice.currency);

  fillRect(doc, M, y, CW, 26, '#eff6ff');
  strokeRect(doc, M, y, CW, 26, '#bfdbfe');

  doc.font('Helvetica-Bold').fontSize(8).fillColor(BLUE)
    .text('Amount in Words: ', M + 12, y + 9, { continued: true, lineBreak: false });
  doc.font('Helvetica').fontSize(8).fillColor('#1d4ed8')
    .text(words, { lineBreak: false });

  return y + 36;
};

// ─── Section: BANK DETAILS ───────────────────────────────────────────────────
const drawBankDetails = (doc, company, y) => {
  const banks = company?.bankDetails;
  if (!banks || banks.length === 0) return y;

  y = checkPage(doc, y, 85);

  // Section header bar
  fillRect(doc, M, y, CW, 18, '#dbeafe');
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(BLUE)
    .text('BANK DETAILS', M + 12, y + 5, { lineBreak: false });
  y += 18;

  const bank   = banks[0];
  const fields = [
    bank.bankName      ? ['Bank Name',       safe(bank.bankName)]      : null,
    bank.accountName   ? ['Account Name',    safe(bank.accountName)]   : null,
    bank.accountNumber ? ['Account Number',  safe(bank.accountNumber)] : null,
    bank.routingNumber ? ['Routing Number',  safe(bank.routingNumber)] : null,
    bank.ifscCode      ? ['IFSC Code',       safe(bank.ifscCode)]      : null,
    bank.branch        ? ['Branch',          safe(bank.branch)]        : null,
    bank.swiftCode     ? ['SWIFT Code',      safe(bank.swiftCode)]     : null,
  ].filter(Boolean);

  const colW = CW / 2;
  const rows  = Math.ceil(fields.length / 2);
  const bodyH = rows * 24 + 10;

  fillRect(doc, M, y, CW, bodyH, BGLT);
  strokeRect(doc, M, y - 18, CW, bodyH + 18);

  fields.forEach(([label, value], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const bx  = M + col * colW + 12;
    const by  = y + row * 24 + 8;

    doc.font('Helvetica').fontSize(7.5).fillColor(GRAY)
      .text(label, bx, by, { lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(9).fillColor(NAVY)
      .text(value || '\u2014', bx, by + 10, { width: colW - 24, lineBreak: false });
  });

  return y + bodyH + 12;
};

// ─── Section: NOTES ───────────────────────────────────────────────────────────
const drawNotes = (doc, invoice, y) => {
  if (!invoice.notes) return y;
  y = checkPage(doc, y, 50);

  fillRect(doc, M, y, CW, 16, '#fffbeb');
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(AMBER)
    .text('NOTES', M + 12, y + 5, { lineBreak: false });
  y += 16;

  const text = safe(invoice.notes);
  // Estimate height: ~12pt per line, ~90 chars per line at 9pt
  const lines  = Math.max(1, Math.ceil(text.length / 90));
  const bodyH  = lines * 12 + 16;

  fillRect(doc, M, y, CW, bodyH, '#fffbeb');
  strokeRect(doc, M, y - 16, CW, bodyH + 16, '#fde68a');

  doc.font('Helvetica').fontSize(9).fillColor(BODY)
    .text(text, M + 12, y + 8, { width: CW - 24 });

  return y + bodyH + 10;
};

// ─── Section: TERMS & CONDITIONS ─────────────────────────────────────────────
const drawTerms = (doc, invoice, y) => {
  if (!invoice.termsAndConditions) return y;
  y = checkPage(doc, y, 50);

  fillRect(doc, M, y, CW, 16, '#f8fafc');
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(GRAY)
    .text('TERMS & CONDITIONS', M + 12, y + 5, { lineBreak: false });
  y += 16;

  const text  = safe(invoice.termsAndConditions);
  const lines = Math.max(1, Math.ceil(text.length / 90));
  const bodyH = lines * 12 + 16;

  fillRect(doc, M, y, CW, bodyH, WHITE);
  strokeRect(doc, M, y - 16, CW, bodyH + 16);

  doc.font('Helvetica').fontSize(9).fillColor(GRAY)
    .text(text, M + 12, y + 8, { width: CW - 24 });

  return y + bodyH + 10;
};

// ─── Section: CUSTOM FIELDS ───────────────────────────────────────────────────
// `fields` is a plain object merging client.customFields + invoice.customFields
const drawCustomFields = (doc, fields, y) => {
  if (!fields || typeof fields !== 'object') return y;

  // Collect non-empty entries
  const entries = Object.entries(fields).filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== '');
  if (entries.length === 0) return y;

  y = checkPage(doc, y, 50);

  // Section header bar
  fillRect(doc, M, y, CW, 16, '#f1f5f9');
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(GRAY)
    .text('ADDITIONAL INFORMATION', M + 12, y + 5, { lineBreak: false });
  y += 16;

  const ROW_H = 20;
  const bodyH = entries.length * ROW_H + 8;
  fillRect(doc, M, y, CW, bodyH, WHITE);
  strokeRect(doc, M, y - 16, CW, bodyH + 16);

  const colW = CW / 2;
  entries.forEach(([key, value], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const fx  = M + col * colW + 12;
    const fy  = y + row * ROW_H + 6;

    // Format key: replace underscores/hyphens with spaces, title-case
    const label = key.replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

    doc.font('Helvetica').fontSize(7.5).fillColor(GRAY)
      .text(label, fx, fy, { width: colW - 24, lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(NAVY)
      .text(String(value), fx, fy + 10, { width: colW - 24, lineBreak: false });
  });

  return y + bodyH + 10;
};

// ─── Section: AUTHORISED SIGNATORY ───────────────────────────────────────────
const drawSignature = (doc, invoice, y) => {
  y = checkPage(doc, y, 55);
  y += 20;
  const sender = invoice.senderDetails || {};
  const sigX   = R - 180;

  doc.moveTo(sigX, y).lineTo(R, y).strokeColor('#cbd5e1').lineWidth(0.5).stroke();
  doc.font('Helvetica').fontSize(8.5).fillColor(GRAY)
    .text('Authorised Signatory', sigX, y + 6, { width: 180, align: 'center', lineBreak: false });
  doc.font('Helvetica-Bold').fontSize(9).fillColor(NAVY)
    .text(safe(sender.name || company?.companyName || ''), sigX, y + 19, { width: 180, align: 'center', lineBreak: false });

  return y + 42;
};

// ─── Section: FOOTER BAR (drawn last on every page) ──────────────────────────
const drawFooter = (doc, invoice, logoBuffer) => {
  const fy = PH - FOOT_H;

  fillRect(doc, 0, fy, PW, FOOT_H, NAVY);

  // Center top: thank you
  doc.font('Helvetica').fontSize(10).fillColor(WHITE)
    .text('Thank you for your business', M, fy + 10, { width: CW, align: 'center', lineBreak: false });

  // Center bottom: system-generated disclaimer
  doc.font('Helvetica').fontSize(7.5).fillColor('#8faecf')
    .text('This is a System Generated Invoice', M, fy + 28,
      { width: CW, align: 'center', lineBreak: false });

  // Right: invoice # + generated date
  doc.font('Helvetica').fontSize(8).fillColor('#5a7ea0')
    .text(`${safe(invoice.invoiceNumber)}  |  Dated ${fmtDate(invoice.invoiceDate)}`, M, fy + 44,
      { width: CW, align: 'right', lineBreak: false });
};

// ─── Main Generator ───────────────────────────────────────────────────────────
/**
 * Generate a PDF for an invoice and save it to disk.
 *
 * @param {string|ObjectId|Object} invoiceIdOrObject
 *   Pass an invoice _id / id string  → function fetches fresh from DB (existing callers unchanged).
 *   Pass a full invoice plain object → function uses it directly, skipping the DB fetch.
 *   The second form is preferred in sendInvoiceEmail so the calling code fully
 *   controls which DB snapshot is used and there is no implicit re-fetch that
 *   could silently return a different version of the document.
 */
const generateInvoicePdf = async (invoiceIdOrObject) => {
  ensureDir();

  let invoice;
  // Distinguish a full invoice plain-object from an ID (string or ObjectId).
  // We check for `invoiceNumber` — a field that every invoice document has
  // but that a Mongoose ObjectId / raw string will never have.
  if (invoiceIdOrObject && typeof invoiceIdOrObject === 'object' && invoiceIdOrObject.invoiceNumber !== undefined) {
    // Caller supplied the full plain object — use it directly (no re-fetch).
    invoice = invoiceIdOrObject;
  } else {
    // Caller supplied an ID (string or ObjectId) — fetch fresh from DB.
    invoice = await Invoice.findById(invoiceIdOrObject).lean();
  }
  if (!invoice) throw new Error('Invoice not found');

  const [company, clientDoc] = await Promise.all([
    Company.findById(invoice.company).lean(),
    // Fetch full client so we always use the latest billing address / GST / name
    Client.findById(invoice.client).lean(),
  ]);

  // ── Back-fill senderDetails from live company record ──────────────────────
  // Covers fields that may be missing from older invoice snapshots.
  if (company) {
    invoice = {
      ...invoice,
      senderDetails: {
        ...invoice.senderDetails,
        website:  invoice.senderDetails?.website  || company.website  || null,
        address:  invoice.senderDetails?.address  || null,
        email:    invoice.senderDetails?.email    || company.email    || null,
        phone:    invoice.senderDetails?.phone    || company.phone    || null,
      },
    };
  }

  // ── Always refresh recipientDetails from the live client record ───────────
  // When a client's billing address / name / GST is edited after invoice
  // creation the stored snapshot becomes stale.  We overwrite it here so
  // the PDF always reflects the current client data.
  if (clientDoc) {
    const buildAddress = (addr) => {
      if (!addr) return '';
      return [
        addr.line1,
        addr.line2,
        [addr.city, addr.state].filter(Boolean).join(', '),
        addr.zip || addr.pincode,
        addr.country,
      ].filter(Boolean).join('\n');
    };

    invoice = {
      ...invoice,
      recipientDetails: {
        name:            clientDoc.clientName           || invoice.recipientDetails?.name           || '',
        companyName:     clientDoc.companyName          || invoice.recipientDetails?.companyName    || '',
        email:           clientDoc.email                || invoice.recipientDetails?.email          || '',
        phone:           clientDoc.phone                || invoice.recipientDetails?.phone          || '',
        billingAddress:  buildAddress(clientDoc.billingAddress) || invoice.recipientDetails?.billingAddress || '',
        shippingAddress: buildAddress(clientDoc.shippingAddress) || invoice.recipientDetails?.shippingAddress || '',
        gstNumber:       clientDoc.gstNumber            || invoice.recipientDetails?.gstNumber      || '',
      },
    };
  }

  // Merge client-level custom fields + invoice-level custom fields.
  // Invoice fields take precedence if the same key exists in both.
  const clientCF  = clientDoc?.customFields || {};
  const invoiceCF = invoice.customFields    || {};
  // clientCF may be a Mongoose Map serialised as a plain object or a real Map — normalise both
  const clientCFPlain = clientCF instanceof Map
    ? Object.fromEntries(clientCF)
    : (typeof clientCF === 'object' ? clientCF : {});
  const mergedCustomFields = { ...clientCFPlain, ...invoiceCF };

  // Filename format: Invoice_SSI-PAL-2026-27-000002.pdf
  // Sanitise invoice number for safe filesystem use, then add Invoice_ prefix.
  const safeName = safe(invoice.invoiceNumber).replace(/[/\\:*?"<>|\s]/g, '-');
  const filename  = `Invoice_${safeName}.pdf`;
  const filePath  = path.join(PDFS_DIR, filename);

  console.log('PDF generation started', { invoiceId: String(invoice._id), invoiceNumber: invoice.invoiceNumber });

  // Load logo once (local file or remote URL) before opening the PDFDocument stream
  const logoBuffer = await loadLogoBuffer(invoice.senderDetails?.logo || company?.logo);

  await new Promise((resolve, reject) => {
    const doc    = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true });
    const stream = fs.createWriteStream(filePath);

    doc.pipe(stream);

    // ── Draw all sections ──
    // drawHeader is async (logo may need downloading); wrap in an IIFE so we
    // can await it before the remaining synchronous draw calls.
    (async () => {
      try {
        let y = await drawHeader(doc, invoice, company, logoBuffer);
        y = drawAccentBar(doc, y);
        y = drawMetaStrip(doc, invoice, y);
        y = drawParties(doc, invoice, y);
        y = drawProject(doc, invoice, y);
        y = drawItemsTable(doc, invoice, y);
        y = drawTotals(doc, invoice, y);
        y = drawCustomFields(doc, mergedCustomFields, y);
        y = drawBankDetails(doc, company, y);
        y = drawNotes(doc, invoice, y);
        drawTerms(doc, invoice, y);

        // Footer on every page
        const { count, start } = doc.bufferedPageRange();
        for (let i = 0; i < count; i++) {
          doc.switchToPage(start + i);
          drawFooter(doc, invoice, logoBuffer);
        }

        doc.flushPages();
        doc.end();
      } catch (err) {
        doc.end();
        reject(err);
      }
    })();

    stream.on('finish', resolve);
    stream.on('error', reject);
  });

  const relativePath = path.posix.join('uploads', 'pdfs', filename);

  await Invoice.findByIdAndUpdate(invoice._id, {
    pdfUrl:         relativePath,
    pdfGeneratedAt: new Date(),
  });

  console.log('PDF generation complete', { file: filePath, size: fs.statSync(filePath).size });
  logger.info(`[pdf] Saved locally: ${filePath}`);

  return relativePath;
};

module.exports = { generateInvoicePdf };
