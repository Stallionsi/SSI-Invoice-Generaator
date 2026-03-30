import clsx from 'clsx';

export default function Spinner({ className }) {
  return (
    <div
      className={clsx(
        'animate-spin rounded-full border-2 border-gray-200 border-t-primary-600 w-5 h-5',
        className,
      )}
    />
  );
}
