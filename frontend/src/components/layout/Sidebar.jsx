import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Users, FileText, BarChart2, Settings, Zap, X, ChevronLeft, ChevronRight,
} from 'lucide-react';
import clsx from 'clsx';

const GENERAL_LINKS = [
  { to: '/',         label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/clients',  label: 'Clients',   icon: Users },
  { to: '/invoices', label: 'Invoices',  icon: FileText },
];

const ORG_LINKS = [
  { to: '/reports',  label: 'Reports',  icon: BarChart2 },
  { to: '/settings', label: 'Settings', icon: Settings },
];

function NavItem({ to, label, icon: Icon, end, collapsed, onClose }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClose}
      title={collapsed ? label : undefined}
      className={({ isActive }) =>
        clsx(
          'flex items-center gap-3 rounded-xl text-sm font-medium transition-all duration-200 select-none relative group',
          collapsed ? 'justify-center px-0 py-2.5 mx-1' : 'px-3 py-2.5',
          isActive
            ? 'bg-primary-600 text-white shadow-sm'
            : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100',
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon
            className={clsx('shrink-0 transition-colors', isActive ? 'text-white' : 'text-gray-400 group-hover:text-gray-700')}
            style={{ width: 18, height: 18 }}
          />

          {/* Label — hidden when collapsed on desktop */}
          {!collapsed && (
            <span className={isActive ? 'text-white' : ''}>{label}</span>
          )}

          {/* Tooltip when collapsed */}
          {collapsed && (
            <span
              className="absolute left-full ml-3 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-white whitespace-nowrap
                         pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50"
              style={{ background: '#1E1B4B', boxShadow: '0 4px 12px rgba(0,0,0,0.20)' }}
            >
              {label}
            </span>
          )}
        </>
      )}
    </NavLink>
  );
}

export default function Sidebar({ open, onClose, collapsed, onToggleCollapse }) {
  const width = collapsed ? 68 : 252;

  return (
    <>
      {/* Mobile backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-30 lg:hidden"
          style={{ background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(3px)' }}
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={clsx(
          'fixed lg:static inset-y-0 left-0 z-40 flex flex-col shrink-0 bg-white',
          // Smooth width transition on desktop, translate on mobile
          'transition-all duration-300 ease-in-out',
          open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
        style={{
          width,
          borderRight: '1px solid #EEF2FF',
          boxShadow: '2px 0 12px rgba(99,102,241,0.06)',
          overflow: 'hidden',
        }}
      >
        {/* ── Brand ───────────────────────────────────────────────── */}
        <div
          className="flex items-center justify-between shrink-0 px-4 py-5"
          style={{ borderBottom: '1px solid #F3F4F6', minHeight: 68 }}
        >
          {/* Logo always visible */}
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="flex items-center justify-center rounded-xl shrink-0"
              style={{
                width: 36, height: 36,
                background: 'linear-gradient(135deg, #6366F1, #4F46E5)',
                boxShadow: '0 2px 8px rgba(99,102,241,0.40)',
              }}
            >
              <Zap style={{ width: 18, height: 18, color: 'white' }} fill="white" />
            </div>

            {/* Text — slides out when collapsed */}
            <div
              className="overflow-hidden transition-all duration-300"
              style={{ width: collapsed ? 0 : 140, opacity: collapsed ? 0 : 1 }}
            >
              <p className="text-sm font-bold text-gray-900 leading-tight whitespace-nowrap">InvoiceApp</p>
              <p className="text-[10px] font-semibold tracking-widest uppercase whitespace-nowrap"
                 style={{ color: '#F97316' }}>StallionSI</p>
            </div>
          </div>

          {/* Mobile close */}
          <button
            onClick={onClose}
            className="lg:hidden flex items-center justify-center w-7 h-7 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors shrink-0"
            aria-label="Close menu"
          >
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        {/* ── Navigation ──────────────────────────────────────────── */}
        <nav className="flex-1 py-4 overflow-y-auto overflow-x-hidden"
             style={{ padding: collapsed ? '16px 0' : '16px 12px' }}>

          {/* General section */}
          <div className="mb-5">
            {!collapsed && (
              <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                General
              </p>
            )}
            {collapsed && <div className="mb-2 h-px mx-3 bg-gray-100" />}
            <div className="space-y-0.5">
              {GENERAL_LINKS.map(({ to, label, icon, end }) => (
                <NavItem
                  key={to} to={to} label={label} icon={icon} end={end}
                  collapsed={collapsed} onClose={onClose}
                />
              ))}
            </div>
          </div>

          {/* Organization section */}
          <div>
            {!collapsed && (
              <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                Organization
              </p>
            )}
            {collapsed && <div className="mb-2 h-px mx-3 bg-gray-100" />}
            <div className="space-y-0.5">
              {ORG_LINKS.map(({ to, label, icon }) => (
                <NavItem
                  key={to} to={to} label={label} icon={icon}
                  collapsed={collapsed} onClose={onClose}
                />
              ))}
            </div>
          </div>
        </nav>

        {/* ── Footer / Collapse toggle ─────────────────────────────── */}
        <div
          className="shrink-0 px-3 py-3"
          style={{ borderTop: '1px solid #F3F4F6' }}
        >
          {/* Desktop collapse button */}
          <button
            onClick={onToggleCollapse}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={clsx(
              'hidden lg:flex items-center gap-2 w-full rounded-xl px-3 py-2.5 text-xs font-semibold text-gray-500',
              'hover:bg-gray-100 hover:text-gray-800 transition-all duration-150',
              collapsed && 'justify-center px-0',
            )}
          >
            {collapsed
              ? <ChevronRight style={{ width: 16, height: 16 }} />
              : (
                <>
                  <ChevronLeft style={{ width: 16, height: 16 }} />
                  <span>Collapse</span>
                </>
              )
            }
          </button>

          {/* Version label — only when expanded */}
          {!collapsed && (
            <p className="px-3 pt-1 text-[10px] font-medium tracking-widest uppercase text-gray-400">
              Invoice Manager · v1.0
            </p>
          )}
        </div>
      </aside>
    </>
  );
}
