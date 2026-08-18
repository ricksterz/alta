import { useId } from "react";

// The mark: three lanes of different weight converging into one point,
// the same "many parties, one settled position" shape the chain-of-custody
// diagram draws in full. The terminal segment picks up a cyan accent so the
// landing point reads as a distinct destination, not just a stroke end.
// useId keeps the gradient id collision-free if the logo is ever mounted
// more than once on a page (nav + hero, say).
export function LogoMark({ className = "h-8 w-8" }: { className?: string }) {
  const gradientId = useId();
  return (
    <svg viewBox="0 0 40 40" className={className} fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop stopColor="#4f46e5" />
          <stop offset="1" stopColor="#7c3aed" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="11" fill={`url(#${gradientId})`} />
      <path d="M7 13C14 13 18 18 27 20" stroke="white" strokeOpacity="0.55" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M7 20H27" stroke="white" strokeOpacity="0.95" strokeWidth="2.8" strokeLinecap="round" />
      <path d="M7 27C14 27 18 22 27 20" stroke="white" strokeOpacity="0.55" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M27 20H32" stroke="#22D3EE" strokeWidth="2.8" strokeLinecap="round" />
      <circle cx="33" cy="20" r="2.8" fill="#22D3EE" />
    </svg>
  );
}

export function Logo({
  iconClassName = "h-8 w-8",
  textClassName = "text-lg",
}: {
  iconClassName?: string;
  textClassName?: string;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <LogoMark className={iconClassName} />
      <span className={`font-display font-bold tracking-tight ${textClassName}`}>
        <span className="text-slate-900 dark:text-slate-50">Alts</span>
        <span className="text-indigo-500 dark:text-indigo-400">Flow</span>
      </span>
    </span>
  );
}
