import api from './axios';

export const getRevenueSummary  = (params) => api.get('/reports/revenue', { params });
// Pending + aging buckets live under /reports/pending (there is no /reports/aging route)
export const getAgingReport     = ()       => api.get('/reports/pending');
export const getClientReport    = ()       => api.get('/reports/clients');
export const getGstReport       = (params) => api.get('/reports/taxes', { params });
// Correct export route is /reports/export/invoices
export const exportCsv          = (params) => api.get('/reports/export/invoices', { params });
