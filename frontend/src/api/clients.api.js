import api from './axios';

export const getClients = (params) => api.get('/clients', { params });
export const getClient = (id) => api.get(`/clients/${id}`);
export const createClient = (data) => api.post('/clients', data);
export const updateClient = (id, data) => api.patch(`/clients/${id}`, data);
export const deleteClient = (id) => api.delete(`/clients/${id}`);
