import api from './axios';

export const getMyCompanies         = ()     => api.get('/company');
export const getCompany             = ()     => api.get('/company/me');
export const createCompany          = (data) => api.post('/company', data);
export const updateCompany          = (data) => api.patch('/company/me', data);
export const updateInvoiceSettings  = (data) => api.patch('/company/settings', data);
