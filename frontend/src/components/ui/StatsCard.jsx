import clsx from 'clsx';

const ICON_PALETTE = {
  blue:    'bg-primary-50   text-primary-600',
  green:   'bg-emerald-50   text-emerald-600',
  yellow:  'bg-amber-50     text-amber-600',
  red:     'bg-rose-50      text-rose-600',
  teal:    'bg-teal-50      text-teal-600',
};

export default function StatsCard({ title, value, subtitle, icon: Icon, color = 'blue', onClick }) {
  return (
    <div
      className={clsx(
        'card transition-all duration-200',
        onClick && 'cursor-pointer hover:shadow-card-md hover:-translate-y-0.5 active:scale-[0.98]',
      )}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick() : undefined}
    >
      <div className="flex items-center gap-4">
        {Icon && (
          <div className={clsx('rounded-xl p-3 shrink-0', ICON_PALETTE[color] || ICON_PALETTE.blue)}>
            <Icon className="w-5 h-5" />
          </div>
        )}
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{title}</p>
          <p className="text-2xl font-bold text-slate-900 mt-0.5 truncate">{value}</p>
          {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
        </div>
      </div>
    </div>
  );
}
