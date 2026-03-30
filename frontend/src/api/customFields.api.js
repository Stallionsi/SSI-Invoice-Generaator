import api from './axios';

const BASE = '/custom-fields';

export const customFieldsApi = {
  /** List field definitions for a module (e.g. 'invoice', 'client') */
  list: (module, params = {}) =>
    api.get(BASE, { params: { module, ...params } }),

  /** Get a single field definition */
  getById: (id) =>
    api.get(`${BASE}/${id}`),

  /** Create a new custom field (admin) */
  create: (data) =>
    api.post(BASE, data),

  /** Update a custom field (admin) */
  update: (id, data) =>
    api.patch(`${BASE}/${id}`, data),

  /** Soft-delete a custom field (admin) */
  delete: (id) =>
    api.delete(`${BASE}/${id}`),

  /** Bulk reorder fields (admin) */
  reorder: (module, fields) =>
    api.patch(`${BASE}/reorder`, { module, fields }),
};
