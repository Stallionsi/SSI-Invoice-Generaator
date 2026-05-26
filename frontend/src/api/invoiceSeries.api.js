import api from './axios';

export const getInvoiceSeries = ()                  => api.get('/invoice-series');
export const createInvoiceSeries = (data)           => api.post('/invoice-series', data);
export const updateInvoiceSeries = (id, data)       => api.patch(`/invoice-series/${id}`, data);
export const setDefaultInvoiceSeries = (id)         => api.patch(`/invoice-series/${id}/default`);
export const deleteInvoiceSeries = (id)             => api.delete(`/invoice-series/${id}`);
