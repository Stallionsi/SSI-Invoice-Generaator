import clsx from 'clsx';

const PALETTE = {
  green: {
    card:    '#F0FDF4',
    icon:    '#DCFCE7',
    iconFg:  '#16A34A',
    value:   '#14532D',
    label:   '#166534',
  },
  blue: {
    card:    '#EEF2FF',
    icon:    '#E0E7FF',
    iconFg:  '#4F46E5',
    value:   '#1E1B4B',
    label:   '#3730A3',
  },
  teal: {
    card:    '#F0FDFA',
    icon:    '#CCFBF1',
    iconFg:  '#0D9488',
    value:   '#134E4A',
    label:   '#0F766E',
  },
  red: {
    card:    '#FFF1F2',
    icon:    '#FFE4E6',
    iconFg:  '#E11D48',
    value:   '#4C0519',
    label:   '#9F1239',
  },
  yellow: {
    card:    '#FFFBEB',
    icon:    '#FEF3C7',
    iconFg:  '#D97706',
    value:   '#451A03',
    label:   '#92400E',
  },
  purple: {
    card:    '#FAF5FF',
    icon:    '#F3E8FF',
    iconFg:  '#9333EA',
    value:   '#3B0764',
    label:   '#7E22CE',
  },
};

export default function StatsCard({ title, value, subtitle, icon: Icon, color = 'blue', onClick }) {
  const p = PALETTE[color] || PALETTE.blue;

  return (
    <div
      className={clsx(
        'stat-card transition-all duration-200',
        onClick && 'cursor-pointer hover:shadow-card-md hover:-translate-y-0.5 active:scale-[0.98]',
      )}
      style={{ background: p.card }}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick() : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: p.label }}>
            {title}
          </p>
          <p className="text-3xl font-bold tabular-nums leading-none" style={{ color: p.value }}>
            {value}
          </p>
          {subtitle && (
            <p className="text-xs mt-2 font-medium" style={{ color: p.label, opacity: 0.7 }}>
              {subtitle}
            </p>
          )}
        </div>

        {Icon && (
          <div
            className="rounded-xl p-2.5 shrink-0"
            style={{ background: p.icon }}
          >
            <Icon className="w-5 h-5" style={{ color: p.iconFg }} />
          </div>
        )}
      </div>
    </div>
  );
}
