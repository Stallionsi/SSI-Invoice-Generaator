import axios from 'axios';
import { useAuthStore } from '../store/authStore';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true, // send httpOnly cookies
  headers: { 'Content-Type': 'application/json' },
});

// Attach the active company on every request so the backend knows which
// company's data to scope. Falls back to nothing (backend uses companies[0]).
api.interceptors.request.use((config) => {
  const { selectedCompanyId } = useAuthStore.getState();
  if (selectedCompanyId) {
    config.headers['X-Company-Id'] = selectedCompanyId;
  }
  return config;
});

let isRefreshing = false;
let failedQueue = [];

const processQueue = (error) => {
  failedQueue.forEach((p) => (error ? p.reject(error) : p.resolve()));
  failedQueue = [];
};

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then(() => api(original))
          .catch((e) => Promise.reject(e));
      }

      original._retry = true;
      isRefreshing = true;

      try {
        await axios.post('/api/auth/refresh', {}, { withCredentials: true });
        processQueue(null);
        return api(original);
      } catch (refreshErr) {
        processQueue(refreshErr);
        useAuthStore.getState().logout();
        window.location.href = '/login';
        return Promise.reject(refreshErr);
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(error);
  },
);

export default api;
