import { useNavigate } from 'react-router-dom';
import { LogOut, User, Menu, Building2, ChevronDown, ChevronRight } from 'lucide-react';
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
  const activeId = selectedCompanyId || companies[0]?._id;
  const activeCompany = companies.find((c) => c._id === activeId) || companies[0];

  const handleSwitch = (companyId) => {
    if (companyId === activeId) return;
    setSelectedCompanyId(companyId);
    qc.invalidateQueries();
    toast.success(`Switched to ${companies.find((c) => c._id === companyId)?.companyName}`);
  };

  const { mutate: doLogout } = useMutation({
    mutationFn: logout,
    onSettled: () => { clearUser(); navigate('/login'); },
    onError: () => toast.error('Logout failed'),
  });

  const initials = user?.name
    ? user.name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
    : 'U';

  return (
    <header
      className="h-14 flex items-center justify-between px-4 md:px-6 shrink-0 bg-white"
      style={{ borderBottom: '1px solid #DDE6F2', boxShadow: '0 1px 4px rgba(7,21,37,0.06)' }}
    >
      {/* Left — mobile hamburger */}
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="lg:hidden flex items-center justify-center w-8 h-8 rounded-lg transition-colors"
          style={{ color: '#46698A' }}
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Breadcrumb / company context — desktop only */}
        {activeCompany && (
          <div className="hidden lg:flex items-center gap-2">
            <ChevronRight className="w-3.5 h-3.5" style={{ color: '#9DB5CE' }} />
            <span className="text-sm font-medium" style={{ color: '#46698A' }}>
              {activeCompany.companyName}
            </span>
          </div>
        )}
      </div>

      {/* Right — company switcher + user + logout */}
      <div className="flex items-center gap-2">

        {/* Company switcher */}
        {companies.length > 0 && (
          <div className="relative group">
            <button
              className="flex items-center gap-2 h-8 px-3 rounded-lg text-sm font-medium transition-all duration-150"
              style={{
                background: '#F4F8FF',
                border: '1px solid #DDE6F2',
                color: '#1E3650',
              }}
            >
              <Building2 className="w-3.5 h-3.5 shrink-0" style={{ color: '#3B7BF8' }} />
              <span className="max-w-[140px] truncate hidden sm:inline">
                {activeCompany?.companyName || 'Select Company'}
              </span>
              {companies.length > 1 && (
                <ChevronDown className="w-3 h-3 shrink-0" style={{ color: '#9DB5CE' }} />
              )}
            </button>

            {companies.length > 1 && (
              <div
                className="absolute right-0 top-full mt-2 w-60 rounded-xl z-50 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 origin-top-right"
                style={{
                  background: '#FFFFFF',
                  border: '1px solid #DDE6F2',
                  boxShadow: '0 8px 24px rgba(7,21,37,0.12)',
                }}
              >
                <div className="p-1.5">
                  <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest"
                     style={{ color: '#9DB5CE' }}>
                    Switch Company
                  </p>
                  {companies.map((c) => (
                    <button
                      key={c._id}
                      onClick={() => handleSwitch(c._id)}
                      className="w-full text-left flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-colors"
                      style={
                        c._id === activeId
                          ? { background: '#EBF1FF', color: '#1A5CE8' }
                          : { color: '#1E3650' }
                      }
                    >
                      <Building2 className="w-3.5 h-3.5 shrink-0 opacity-60" />
                      <span className="truncate font-medium">{c.companyName}</span>
                      {c._id === activeId && (
                        <span className="ml-auto text-[10px] font-bold uppercase tracking-wider"
                              style={{ color: '#3B7BF8' }}>
                          Active
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Divider */}
        <div className="w-px h-5 hidden sm:block" style={{ background: '#DDE6F2' }} />

        {/* User info */}
        <div className="flex items-center gap-2">
          {/* Avatar with initials */}
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
            style={{ background: 'linear-gradient(135deg, #1A5CE8, #0E34A8)' }}
          >
            {initials}
          </div>
          <div className="hidden sm:block leading-tight">
            <p className="text-sm font-semibold" style={{ color: '#071525' }}>
              {user?.name || 'User'}
            </p>
            <p className="text-[10px] font-medium capitalize" style={{ color: '#9DB5CE' }}>
              {user?.role}
            </p>
          </div>
        </div>

        {/* Logout */}
        <button
          onClick={() => doLogout()}
          className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold transition-all duration-150"
          style={{
            background: '#FFF1F2',
            border: '1px solid #FECDD3',
            color: '#E11D48',
          }}
        >
          <LogOut className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Logout</span>
        </button>
      </div>
    </header>
  );
}
