import clsx from 'clsx';

const MAP = {
  draft:     'bg-slate-200    text-slate-700',
  sent:      'bg-primary-100  text-primary-700',
  partial:   'bg-amber-100    text-amber-700',
  paid:      'bg-emerald-100  text-emerald-700',
  overdue:   'bg-rose-100     text-rose-700',
  cancelled: 'bg-slate-100    text-slate-500',
  viewed:    'bg-teal-100     text-teal-700',
};

export default function StatusBadge({ status }) {
  const key = status?.toLowerCase();
  return (
    <span className={clsx('badge capitalize', MAP[key] || MAP.draft)}>
      {status}
    </span>
  );
}
