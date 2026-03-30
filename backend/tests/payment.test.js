const request  = require('supertest');
const app      = require('../src/app');
const Invoice  = require('../src/models/Invoice.model');
const mongoose = require('mongoose');

// ─── Helpers ──────────────────────────────────────────────────────────────
const AUTH    = '/api/auth';
const INV     = '/api/invoices';
const CLIENTS = '/api/clients';
const CO      = '/api/company';

let accessToken, clientId, invoiceId;

const setup = async () => {
  const reg = await request(app).post(`${AUTH}/register`).send({
    name: 'Finance User', email: 'finance@test.com', password: 'Password1', role: 'admin',
  });
  accessToken = reg.body.data.accessToken;

  await request(app).post(CO).set('Authorization', `Bearer ${accessToken}`)
    .send({ companyName: 'Payment Co', gstNumber: '27AAPFU0939F1ZV' });

  const login = await request(app).post(`${AUTH}/login`).send({ email: 'finance@test.com', password: 'Password1' });
  accessToken = login.body.data.accessToken;

  const cl = await request(app).post(CLIENTS).set('Authorization', `Bearer ${accessToken}`)
    .send({ clientName: 'Payer Corp', email: 'payer@example.com' });
  clientId = cl.body.data.client._id;

  const inv = await request(app).post(INV).set('Authorization', `Bearer ${accessToken}`).send({
    client: clientId,
    gstType: 'none',
    lineItems: [{ description: 'Service', quantity: 1, unitPrice: 10000, taxRate: 0 }],
  });
  invoiceId = inv.body.data.invoice._id;
};

const paymentUrl = () => `${INV}/${invoiceId}/payments`;

const pay = (amount, method = 'bank_transfer') =>
  request(app)
    .post(paymentUrl())
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ paymentAmount: amount, paymentMethod: method });

beforeEach(async () => {
  await setup();
});

// ─── Partial Payment ──────────────────────────────────────────────────────
describe('Partial payment', () => {
  it('records a partial payment and updates invoice to partial status', async () => {
    const res = await pay(4000);

    expect(res.status).toBe(201);

    const inv = await Invoice.findById(invoiceId);
    expect(inv.amountPaid).toBeCloseTo(4000, 2);
    expect(inv.balanceDue).toBeCloseTo(6000, 2);
    expect(inv.status).toBe('partial');
  });

  it('allows multiple partial payments that sum to full amount', async () => {
    await pay(5000);
    const res = await pay(5000);

    expect(res.status).toBe(201);

    const inv = await Invoice.findById(invoiceId);
    expect(inv.amountPaid).toBeCloseTo(10000, 2);
    expect(inv.balanceDue).toBeCloseTo(0, 2);
    expect(inv.status).toBe('paid');
  });
});

// ─── Full Payment ─────────────────────────────────────────────────────────
describe('Full payment', () => {
  it('marks invoice as paid when full amount is received', async () => {
    const res = await pay(10000);

    expect(res.status).toBe(201);

    const inv = await Invoice.findById(invoiceId);
    expect(inv.amountPaid).toBeCloseTo(10000, 2);
    expect(inv.balanceDue).toBeCloseTo(0, 2);
    expect(inv.status).toBe('paid');
  });

  it('queues payment-receipt email job on full payment', async () => {
    const { addEmailJob } = require('../src/config/queue');

    await pay(10000);

    expect(addEmailJob).toHaveBeenCalledWith('payment-receipt', expect.objectContaining({
      invoiceId: invoiceId.toString(),
    }));
  });

  it('emits invoice.paid webhook on full payment', async () => {
    const { addWebhookJob } = require('../src/config/queue');

    await pay(10000);

    expect(addWebhookJob).toHaveBeenCalledWith('payment.recorded', expect.any(Object), expect.anything());
    expect(addWebhookJob).toHaveBeenCalledWith('invoice.paid', expect.objectContaining({ invoiceId: invoiceId.toString() }), expect.anything());
  });
});

// ─── Overpayment Rejection ────────────────────────────────────────────────
describe('Overpayment rejection', () => {
  it('rejects a payment that exceeds the balance due', async () => {
    const res = await pay(10001);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/exceeds/i);
  });

  it('rejects overpayment after a partial payment', async () => {
    await pay(9000); // partial — leaves 1000 remaining

    const res = await pay(2000); // 2000 > 1000 remaining
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/exceeds/i);
  });

  it('does NOT create a payment record when overpayment is rejected', async () => {
    await pay(10001);

    const inv = await Invoice.findById(invoiceId);
    // Invoice state should be unchanged — no amountPaid recorded
    expect(inv.amountPaid).toBeCloseTo(0, 2);
    expect(inv.status).toBe('draft');
  });

  it('rejects payment on a cancelled invoice', async () => {
    await request(app)
      .delete(`${INV}/${invoiceId}`)
      .set('Authorization', `Bearer ${accessToken}`);

    const res = await pay(5000);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/cancelled/i);
  });
});

// ─── Decimal precision ────────────────────────────────────────────────────
describe('Decimal precision', () => {
  it('handles fractional amounts without floating-point error', async () => {
    // Create invoice with a total that triggers floating-point issues: 0.1 + 0.2 = 0.30000000000000004
    const inv2 = await request(app).post(INV).set('Authorization', `Bearer ${accessToken}`).send({
      client:    clientId,
      gstType:   'none',
      lineItems: [{ description: 'Fractional', quantity: 3, unitPrice: 0.1, taxRate: 0 }],
    });
    const id2 = inv2.body.data.invoice._id;

    const res = await request(app)
      .post(`${INV}/${id2}/payments`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ paymentAmount: 0.3, paymentMethod: 'cash' });

    expect(res.status).toBe(201);
    const paid = await Invoice.findById(id2);
    expect(paid.status).toBe('paid');
    expect(paid.balanceDue).toBeCloseTo(0, 4);
  });
});
