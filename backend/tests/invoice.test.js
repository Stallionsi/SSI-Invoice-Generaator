const request  = require('supertest');
const app      = require('../src/app');
const mongoose = require('mongoose');

// ─── Helpers ──────────────────────────────────────────────────────────────
const AUTH    = '/api/auth';
const INV     = '/api/invoices';
const CLIENTS = '/api/clients';
const CO      = '/api/company';

let accessToken, companyId, clientId;

const registerAndSetup = async () => {
  // Register user
  const reg = await request(app).post(`${AUTH}/register`).send({
    name: 'Admin User', email: 'admin@test.com', password: 'Password1', role: 'admin',
  });
  accessToken = reg.body.data.accessToken;

  // Create company
  const co = await request(app)
    .post(CO)
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ companyName: 'Test Co', gstNumber: '27AAPFU0939F1ZV' });
  companyId = co.body.data.company._id;

  // Re-login to get companyId embedded in JWT
  const login = await request(app).post(`${AUTH}/login`).send({ email: 'admin@test.com', password: 'Password1' });
  accessToken = login.body.data.accessToken;

  // Create client
  const cl = await request(app)
    .post(CLIENTS)
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ clientName: 'ACME Corp', email: 'acme@example.com', currency: 'INR' });
  clientId = cl.body.data.client._id;
};

const sampleInvoice = () => ({
  client:      clientId,
  invoiceDate: new Date().toISOString(),
  gstType:     'intrastate',
  lineItems: [
    {
      description: 'Web Development',
      quantity:    10,
      unitPrice:   1000,
      taxRate:     18,
      discount:    { type: 'percentage', value: 10 },
    },
  ],
  currency: 'INR',
});

// ─── Suite setup ──────────────────────────────────────────────────────────
beforeEach(async () => {
  await registerAndSetup();
});

// ─── Create Invoice ────────────────────────────────────────────────────────
describe('POST /api/invoices', () => {
  it('creates an invoice and returns correct totals', async () => {
    const res = await request(app)
      .post(INV)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(sampleInvoice());

    expect(res.status).toBe(201);
    const inv = res.body.data.invoice;

    // quantity=10, unitPrice=1000 → gross=10000
    // discount 10% → discountAmount=1000, taxable=9000
    // GST 18% intrastate → CGST=9% + SGST=9% = 1620
    // grandTotal = 9000 + 1620 = 10620
    expect(inv.subtotal).toBeCloseTo(10000, 1);
    expect(inv.discountTotal).toBeCloseTo(1000, 1);
    expect(inv.taxableAmount).toBeCloseTo(9000, 1);
    expect(inv.cgstTotal).toBeCloseTo(810, 1);
    expect(inv.sgstTotal).toBeCloseTo(810, 1);
    expect(inv.igstTotal).toBeCloseTo(0, 1);
    expect(inv.grandTotal).toBeCloseTo(10620, 1);
    expect(inv.balanceDue).toBeCloseTo(10620, 1);
    expect(inv.status).toBe('draft');
  });

  it('applies invoice-level discount correctly', async () => {
    const res = await request(app)
      .post(INV)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        ...sampleInvoice(),
        invoiceDiscount: { type: 'fixed', value: 500 },
      });

    expect(res.status).toBe(201);
    // grandTotal should be 10620 - 500 (approx, tax recalculated proportionally)
    expect(res.body.data.invoice.grandTotal).toBeLessThan(10620);
  });

  it('uses interstate GST (IGST) when gstType is interstate', async () => {
    const res = await request(app)
      .post(INV)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ ...sampleInvoice(), gstType: 'interstate' });

    expect(res.status).toBe(201);
    const inv = res.body.data.invoice;
    expect(inv.igstTotal).toBeGreaterThan(0);
    expect(inv.cgstTotal).toBeCloseTo(0, 1);
    expect(inv.sgstTotal).toBeCloseTo(0, 1);
  });

  it('requires auth', async () => {
    const res = await request(app).post(INV).send(sampleInvoice());
    expect(res.status).toBe(401);
  });

  it('returns 400 when lineItems is empty', async () => {
    const res = await request(app)
      .post(INV)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ ...sampleInvoice(), lineItems: [] });
    expect(res.status).toBe(400);
  });
});

// ─── List Invoices ─────────────────────────────────────────────────────────
describe('GET /api/invoices', () => {
  it('returns a paginated list', async () => {
    await request(app).post(INV).set('Authorization', `Bearer ${accessToken}`).send(sampleInvoice());
    await request(app).post(INV).set('Authorization', `Bearer ${accessToken}`).send(sampleInvoice());

    const res = await request(app)
      .get(INV)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.invoices).toHaveLength(2);
    expect(res.body.data.pagination).toHaveProperty('total', 2);
  });

  it('filters by status', async () => {
    await request(app).post(INV).set('Authorization', `Bearer ${accessToken}`).send(sampleInvoice());

    const res = await request(app)
      .get(`${INV}?status=draft`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.invoices.every((i) => i.status === 'draft')).toBe(true);
  });
});

// ─── Get Single Invoice ────────────────────────────────────────────────────
describe('GET /api/invoices/:id', () => {
  it('returns the invoice', async () => {
    const created = await request(app).post(INV).set('Authorization', `Bearer ${accessToken}`).send(sampleInvoice());
    const id = created.body.data.invoice._id;

    const res = await request(app).get(`${INV}/${id}`).set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.invoice._id).toBe(id);
  });

  it('returns 404 for unknown id', async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app).get(`${INV}/${fakeId}`).set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(404);
  });
});

// ─── Send Invoice ──────────────────────────────────────────────────────────
describe('POST /api/invoices/:id/send', () => {
  it('transitions status from draft to sent and queues email job', async () => {
    const { addEmailJob } = require('../src/config/queue');
    const created = await request(app).post(INV).set('Authorization', `Bearer ${accessToken}`).send(sampleInvoice());
    const id = created.body.data.invoice._id;

    const res = await request(app)
      .post(`${INV}/${id}/send`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ recipientEmail: 'client@example.com' });

    expect(res.status).toBe(200);
    expect(addEmailJob).toHaveBeenCalledWith('invoice-email', expect.objectContaining({ invoiceId: id }));
  });
});
