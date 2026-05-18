import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useAuthStore = create(
  persist(
    (set) => ({
      user:              null,
      selectedCompanyId: null,
      // Full company object cached from the last successful companies fetch.
      // Stored in localStorage so the company name / prefix is available on
      // cold page load before any network request resolves.
      activeCompany:     null,

      setUser: (user) => set({ user }),

      // Kept for backward compat — axios.js reads selectedCompanyId directly.
      // Internal code should prefer switchCompany() over calling this manually.
      setSelectedCompanyId: (id) => set({ selectedCompanyId: id }),

      // Primary action for switching companies. Sets both fields atomically so
      // there is never a moment where selectedCompanyId and activeCompany._id
      // disagree — which would cause the axios header and the UI to be out of sync.
      switchCompany: (company) =>
        set({
          selectedCompanyId: company._id,
          activeCompany:     company,
        }),

      // Syncs the cached company object without changing the selected ID.
      // Called by useActiveCompany when fresh server data arrives, so the
      // localStorage cache stays current (e.g., after the user updates shortCode).
      syncActiveCompany: (company) => set({ activeCompany: company }),

      logout: () => set({ user: null, selectedCompanyId: null, activeCompany: null }),
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user:              state.user,
        selectedCompanyId: state.selectedCompanyId,
        activeCompany:     state.activeCompany,
      }),
    },
  ),
);
