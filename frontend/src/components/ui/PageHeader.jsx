export default function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
      <div className="min-w-0 flex items-start gap-4">
        {/* Colored left accent bar */}
        <div
          className="w-1 self-stretch rounded-full shrink-0 hidden sm:block"
          style={{ background: 'linear-gradient(180deg, #6366F1, #A78BFA)', minHeight: 40 }}
        />
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">
            {title}
          </h1>
          {subtitle && (
            <p className="text-sm mt-0.5 text-gray-400 font-medium">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {actions}
        </div>
      )}
    </div>
  );
}
