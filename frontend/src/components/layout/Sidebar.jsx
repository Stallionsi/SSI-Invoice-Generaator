import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  FileText,
  BarChart2,
  Settings,
  Zap,
  X,
} from 'lucide-react';
import clsx from 'clsx';

const links = [
  { to: '/',         label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/clients',  label: 'Clients',   icon: Users },
  { to: '/invoices', label: 'Invoices',  icon: FileText },
  { to: '/reports',  label: 'Reports',   icon: BarChart2 },
  { to: '/settings', label: 'Settings',  icon: Settings },
];

export default function Sidebar({ open, onClose }) {
  return (
    <>
      {/* Mobile backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-30 lg:hidden"
          style={{ background: 'rgba(7,21,37,0.55)', backdropFilter: 'blur(3px)' }}
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={clsx(
          'fixed lg:static inset-y-0 left-0 z-40 flex flex-col shrink-0',
          'transition-transform duration-200 ease-in-out',
          open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
        style={{
          width: '240px',
          background: 'linear-gradient(180deg, #071525 0%, #0B1E35 100%)',
          boxShadow: '4px 0 24px rgba(7,21,37,0.20)',
        }}
      >
        {/* ── Brand ────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-5"
             style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-center gap-3">
            {/* Logo mark */}
            <div className="relative flex items-center justify-center w-8 h-8 rounded-lg shrink-0"
                 style={{ background: 'linear-gradient(135deg, #F97316, #E05A00)', boxShadow: '0 2px 8px rgba(249,115,22,0.40)' }}>
              <Zap className="w-4 h-4 text-white" fill="white" />
            </div>
            <div>
              <p className="text-sm font-bold text-white leading-tight tracking-tight">InvoiceApp</p>
              <p className="text-[10px] font-medium tracking-widest uppercase"
                 style={{ color: '#F97316' }}>StallionSI</p>
            </div>
          </div>

          {/* Close — mobile only */}
          <button
            onClick={onClose}
            className="lg:hidden flex items-center justify-center w-7 h-7 rounded-md transition-colors"
            style={{ color: '#4A80C4' }}
            aria-label="Close menu"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Navigation ────────────────────────────────────────── */}
        <nav className="flex-1 py-4 px-3 space-y-0.5 overflow-y-auto">
          {links.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={onClose}
              className={({ isActive }) =>
                clsx(
                  'relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium',
                  'transition-all duration-150 select-none',
                  isActive
                    ? 'nav-item-active text-white'
                    : 'text-navy-300 hover:text-white',
                )
              }
              style={({ isActive }) =>
                isActive
                  ? { background: 'rgba(59,123,248,0.14)', color: '#FFFFFF' }
                  : {}
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    className="w-4 h-4 shrink-0 transition-colors"
                    style={{ color: isActive ? '#6BA3FF' : '#4A80C4' }}
                  />
                  <span>{label}</span>
                  {isActive && (
                    <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary-400 shrink-0" />
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* ── Footer ────────────────────────────────────────────── */}
        <div className="px-5 py-4"
             style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="text-[10px] font-medium tracking-widest uppercase"
             style={{ color: '#2B5EA0' }}>
            Invoice Manager · v1.0
          </p>
        </div>
      </aside>
    </>
  );
}
