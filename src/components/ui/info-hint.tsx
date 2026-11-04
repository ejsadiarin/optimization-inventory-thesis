import { useId, useRef, useState, type ReactNode } from 'react';
import { Info } from 'lucide-react';

export interface InfoHintProps {
  label: string;
  children: ReactNode;
}

export function InfoHint({ label, children }: InfoHintProps) {
  const id = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pinned, setPinned] = useState(false);
  const open = hovered || focused || pinned;

  function close() {
    setHovered(false);
    setFocused(false);
    setPinned(false);
    buttonRef.current?.blur();
  }

  return (
    <span
      className="relative inline-flex align-middle"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          close();
        }
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-label={`About ${label}`}
        aria-describedby={open ? id : undefined}
        className="inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          setPinned(false);
        }}
        onClick={() => {
          if (pinned) {
            close();
          } else {
            setPinned(true);
          }
        }}
      >
        <Info className="h-4 w-4" aria-hidden="true" />
      </button>
      <span
        id={id}
        role="tooltip"
        className={[
          'pointer-events-none absolute left-0 top-full z-50 mt-1.5 w-64 max-w-[calc(100vw-2rem)] rounded-md border bg-card p-3 text-xs leading-relaxed text-muted-foreground shadow-md transition-opacity duration-150 sm:w-72',
          open ? 'opacity-100' : 'opacity-0',
        ].join(' ')}
      >
        {children}
      </span>
    </span>
  );
}
