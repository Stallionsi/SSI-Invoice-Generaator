import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  FileText,
  BarChart2,
  Settings,
  Receipt,
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
          className="fixed inset-0 z-30 bg-slate-900/30 backdrop-blur-sm lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={clsx(
          'fixed lg:static inset-y-0 left-0 z-40 w-64',
          /* White sidebar stands out against the #F1F5F9 gray content area */
          'bg-white border-r border-slate-200 flex flex-col shrink-0',
          'transition-transform duration-200 ease-in-out',
          open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
      >
        {/* Logo */}
        <div className="flex items-center justify-between px-5 py-5 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-primary-500">
              <Receipt className="w-5 h-5 text-white" />
            </div>
            <span className="text-base font-bold text-slate-900 tracking-tight">InvoiceApp</span>
          </div>
          <button
            onClick={onClose}
            className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors duration-200"
            aria-label="Close menu"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 px-3 space-y-0.5">
          {links.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={onClose}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
                  isActive
                    /* Active: blue-100 bg, blue-700 text — exactly per spec */
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className={clsx('w-4 h-4 shrink-0', isActive ? 'text-blue-600' : 'text-slate-400')} />
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-200">
          <p className="text-xs text-slate-400">Invoice Manager v1.0</p>
        </div>
      </aside>
    </>
  );
}
