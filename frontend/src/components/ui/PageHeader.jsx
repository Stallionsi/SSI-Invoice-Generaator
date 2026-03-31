export default function PageHeader({ title, subtitle, actions }) {
  return (
    <div
      className="flex flex-wrap items-start justify-between gap-3 mb-6 pb-5"
      style={{ borderBottom: '1px solid #DDE6F2' }}
    >
      <div className="min-w-0">
        <h1 className="text-xl font-bold tracking-tight truncate" style={{ color: '#071525' }}>
          {title}
        </h1>
        {subtitle && (
          <p className="text-sm mt-0.5" style={{ color: '#46698A' }}>
            {subtitle}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {actions}
        </div>
      )}
    </div>
  );
}
