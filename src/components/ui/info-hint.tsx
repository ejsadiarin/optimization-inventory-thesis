import { useId, type ReactNode } from 'react';
import { Info } from 'lucide-react';

export interface InfoHintProps {
  label: string;
  children: ReactNode;
}

export function InfoHint({ label, children }: InfoHintProps) {
  const id = useId();

  return (
    <span className="group relative inline-flex align-middle">
      <button
        type="button"
        aria-label={`About ${label}`}
        aria-describedby={id}
        className="inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <Info className="h-4 w-4" aria-hidden="true" />
      </button>
      <span
        id={id}
        role="tooltip"
        className="pointer-events-none absolute left-0 top-full z-50 mt-1.5 w-64 rounded-md border bg-card p-3 text-xs leading-relaxed text-muted-foreground opacity-0 shadow-md transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 sm:w-72"
      >
        {children}
      </span>
    </span>
  );
}
