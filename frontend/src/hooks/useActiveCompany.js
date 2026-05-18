import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/authStore';
import { getMyCompanies } from '../api/company.api';

/**
 * Central hook for multi-company context.
 *
 * Responsibilities:
 *   1. Fetch and cache the user's company list (shared across all consumers via
 *      React Query deduplication — only one HTTP request fires app-wide).
 *   2. Resolve which company is currently active.
 *   3. Keep Zustand's activeCompany in sync with fresh server data (for
 *      localStorage persistence and non-hook consumers like axios interceptors).
 *   4. Expose handleSwitch() — the single place that changes the active company,
 *      updates Zustand, invalidates all caches, and shows the toast.
 *
 * Usage:
 *   const { companies, activeCompany, activeId, isLoading, handleSwitch } = useActiveCompany();
 *
 * Multiple components can call this hook simultaneously — they all share the
 * same React Query cache entry for ['my-companies'], so there is exactly one
 * network request in flight at any time.
 */
export function useActiveCompany() {
  const qc = useQueryClient();
  const { selectedCompanyId, switchCompany, syncActiveCompany } = useAuthStore();

  const { data: companies = [], isLoading } = useQuery({
    queryKey: ['my-companies'],
    queryFn:  async () => {
      const res = await getMyCompanies();
      return res.data?.data?.companies ?? [];
    },
    staleTime: 5 * 60 * 1000, // companies list changes rarely; 5-min cache is appropriate
  });

  // Resolve active company from fetched list.
  // Falls back to companies[0] if selectedCompanyId is null or no longer in the list
  // (e.g., user was removed from a company between sessions).
  const activeId      = selectedCompanyId || companies[0]?._id || null;
  const activeCompany = companies.find((c) => c._id === activeId) ?? companies[0] ?? null;

  // Sync fresh server data into Zustand so localStorage stays current.
  // Uses getState() instead of subscribing to storedActiveCompany to avoid
  // adding it to the dep array, which would create a feedback loop:
  //   syncActiveCompany() updates store → storedActiveCompany changes → effect reruns
  //
  // Condition: only sync when activeCompany._id differs from what is stored.
  // This prevents a write on every render while still catching two cases:
  //   a) First load: storedActiveCompany is null → sync immediately
  //   b) shortCode / settings updated on another tab → stored data is stale → sync
  useEffect(() => {
    if (isLoading || !activeCompany) return;
    const storedId = useAuthStore.getState().activeCompany?._id;
    if (activeCompany._id !== storedId) {
      syncActiveCompany(activeCompany);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCompany?._id, isLoading]);

  /**
   * Switch the active company.
   *
   * @param {{ _id: string, companyName: string, shortCode?: string, invoiceSettings?: object }} company
   *   The full company object from the companies list. Must be passed as an object
   *   (not just an ID) so switchCompany() can update activeCompany in Zustand atomically.
   */
  const handleSwitch = (company) => {
    if (!company || company._id === activeId) return;
    // Single Zustand write: sets both selectedCompanyId and activeCompany together.
    // This ensures axios.js picks up the new X-Company-Id header and the UI
    // reflects the new company name at the same time — never out of sync.
    switchCompany(company);
    // Invalidate everything: clients, invoices, next-number, reports, dashboard.
    // No filter needed — all data is company-scoped and must be re-fetched.
    qc.invalidateQueries();
    toast.success(`Switched to ${company.companyName}`);
  };

  return {
    companies,      // full list of user's companies
    activeCompany,  // resolved active company object (from server, fresh)
    activeId,       // resolved active company _id string
    isLoading,      // true while the initial companies fetch is in flight
    handleSwitch,   // call with a company object to switch context
  };
}
