import { useNavigate } from 'react-router-dom';
import { LogOut, User, Menu, Building2, ChevronDown } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { logout } from '../../api/auth.api';
import { getMyCompanies } from '../../api/company.api';
import { useAuthStore } from '../../store/authStore';

export default function Navbar({ onMenuClick }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user, logout: clearUser, selectedCompanyId, setSelectedCompanyId } = useAuthStore();

  const { data: companiesData } = useQuery({
    queryKey: ['my-companies'],
    queryFn: getMyCompanies,
    staleTime: 5 * 60 * 1000,
  });

  const companies = companiesData?.data?.data?.companies || [];

  // Auto-select first company if nothing is selected yet
  const activeId = selectedCompanyId || companies[0]?._id;
  const activeCompany = companies.find((c) => c._id === activeId) || companies[0];

  const handleSwitch = (companyId) => {
    if (companyId === activeId) return;
    setSelectedCompanyId(companyId);
    // Invalidate all data queries so they re-fetch under the new company scope
    qc.invalidateQueries();
    toast.success(`Switched to ${companies.find((c) => c._id === companyId)?.companyName}`);
  };

  const { mutate: doLogout } = useMutation({
    mutationFn: logout,
    onSettled: () => { clearUser(); navigate('/login'); },
    onError: () => toast.error('Logout failed'),
  });

  return (
    <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-4 md:px-6 shrink-0 shadow-card">
      {/* Hamburger — mobile only */}
      <button
        onClick={onMenuClick}
        className="lg:hidden p-2 -ml-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
        aria-label="Open menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      <div className="hidden lg:block" />

      <div className="flex items-center gap-3">

        {/* Company switcher — only shown when user has access to >0 companies */}
        {companies.length > 0 && (
          <div className="relative group">
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border border-slate-200 bg-slate-50 hover:bg-slate-100 transition-colors">
              <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="font-medium text-slate-700 max-w-[140px] truncate">
                {activeCompany?.companyName || 'Select Company'}
              </span>
              {companies.length > 1 && (
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              )}
            </button>

            {/* Dropdown — only rendered when there are multiple companies */}
            {companies.length > 1 && (
              <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-slate-200 rounded-xl shadow-lg z-50 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150">
                <div className="p-1">
                  {companies.map((c) => (
                    <button
                      key={c._id}
                      onClick={() => handleSwitch(c._id)}
                      className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                        c._id === activeId
                          ? 'bg-primary-50 text-primary-700 font-medium'
                          : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <Building2 className="w-3.5 h-3.5 shrink-0 opacity-60" />
                      <span className="truncate">{c.companyName}</span>
                      {c._id === activeId && (
                        <span className="ml-auto text-xs text-primary-500">active</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* User info */}
        <div className="flex items-center gap-2 text-sm">
          <div className="w-7 h-7 rounded-full bg-primary-100 flex items-center justify-center shrink-0">
            <User className="w-3.5 h-3.5 text-primary-600" />
          </div>
          <span className="font-medium text-slate-800 hidden sm:inline">{user?.name || 'User'}</span>
          <span className="text-xs text-slate-400 capitalize hidden sm:inline">· {user?.role}</span>
        </div>

        <button onClick={() => doLogout()} className="btn btn-secondary btn-sm">
          <LogOut className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Logout</span>
        </button>
      </div>
    </header>
  );
}
