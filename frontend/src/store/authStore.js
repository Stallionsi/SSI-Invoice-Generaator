import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useAuthStore = create(
  persist(
    (set) => ({
      user: null,
      selectedCompanyId: null,
      setUser: (user) => set({ user }),
      setSelectedCompanyId: (id) => set({ selectedCompanyId: id }),
      logout: () => set({ user: null, selectedCompanyId: null }),
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ user: state.user, selectedCompanyId: state.selectedCompanyId }),
    },
  ),
);
