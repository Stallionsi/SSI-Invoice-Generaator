import api from './axios';

export const getInvoices = (params) => api.get('/invoices', { params });
export const getInvoice = (id) => api.get(`/invoices/${id}`);
export const createInvoice = (data) => api.post('/invoices', data);
export const updateInvoice = (id, data) => api.patch(`/invoices/${id}`, data);
export const deleteInvoice = (id) => api.delete(`/invoices/${id}`);
export const sendInvoice   = (id, data) => api.post(`/invoices/${id}/send`, data);
export const markInvoiceSent = (id)    => api.post(`/invoices/${id}/mark-sent`);
export const generatePdf = (id) => api.get(`/invoices/${id}/pdf`, { responseType: 'blob' });

export const addPayment = (invoiceId, data) =>
  api.post(`/invoices/${invoiceId}/payments`, data);

export const getNextInvoiceNumber = (clientId, seriesId) => {
  const params = {};
  if (clientId) params.clientId = clientId;
  if (seriesId) params.seriesId = seriesId;
  return api.get('/invoices/next-number', { params });
};

