import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { api, ApiError } from "../lib/api";
import { ThemeToggle } from "../components/ThemeToggle";
import { SettlementChainDiagram } from "../components/SettlementChainDiagram";
import { SiteFooter } from "../components/SiteFooter";
import { Logo } from "../components/Logo";

// Role selection rather than credentials. AltsFlow is a multi-party product —
// the same subscription looks different to an advisor, a GP, an administrator,
// counsel, and a custodian — and asking a visitor to remember which seeded
// email maps to which side got in the way of showing that.
//
// The personas come from the server so this list can't drift from the
// allowlist that actually authorises them (routes/auth.ts).

interface DemoPersona {
  email: string;
  label: string;
  description: string;
}

// Icon + accent per seeded persona, keyed by the email routes/auth.ts
// authorises — this is presentation only, so it stays client-side rather
// than round-tripping through the API. A persona not in this map (a new one
// added server-side) still renders correctly, just with the default look.
function BriefcaseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M3 13h18" />
    </svg>
  );
}
function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-1a8 8 0 0 1 16 0v1" />
    </svg>
  );
}
function BuildingIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="3" width="16" height="18" rx="1" />
      <path d="M9 21v-4h6v4" />
      <path d="M8 7h.01M12 7h.01M16 7h.01M8 11h.01M12 11h.01M16 11h.01" />
    </svg>
  );
}
function ClipboardIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="6" y="4" width="12" height="17" rx="2" />
      <path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}
function ScaleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v18" />
      <path d="M5 7l-3 6a3 3 0 0 0 6 0z" />
      <path d="M19 7l-3 6a3 3 0 0 0 6 0z" />
      <path d="M5 7h14" />
      <path d="M8 21h8" />
    </svg>
  );
}
function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

const ROLE_VISUALS: Record<string, { icon: () => JSX.Element; badge: string }> = {
  "admin@harborview.test": { icon: BriefcaseIcon, badge: "bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300" },
  "nadia.osei@direct.test": { icon: UserIcon, badge: "bg-teal-50 text-teal-600 dark:bg-teal-950 dark:text-teal-300" },
  "gpops@ares.test": { icon: BuildingIcon, badge: "bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-300" },
  "ops@northbridge.test": { icon: ClipboardIcon, badge: "bg-sky-50 text-sky-600 dark:bg-sky-950 dark:text-sky-300" },
  "counsel@sterlingcross.test": { icon: ScaleIcon, badge: "bg-violet-50 text-violet-600 dark:bg-violet-950 dark:text-violet-300" },
  "ops@meridiantrust.test": { icon: ShieldIcon, badge: "bg-rose-50 text-rose-600 dark:bg-rose-950 dark:text-rose-300" },
};
const DEFAULT_VISUAL = { icon: UserIcon, badge: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" };

export function LoginPage() {
  const { loginAsDemo } = useAuth();
  const navigate = useNavigate();
  const [personas, setPersonas] = useState<DemoPersona[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<DemoPersona[]>("/auth/demo-personas")
      .then(setPersonas)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load roles"));
  }, []);

  async function enterAs(email: string) {
    setError(null);
    setPending(email);
    try {
      await loginAsDemo(email);
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not enter the platform");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center gap-10 px-4 py-10 sm:px-6">
      <div className="w-full max-w-2xl">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <Logo iconClassName="h-9 w-9" textClassName="text-2xl" />
            <p className="font-caveat mt-2 text-2xl leading-none text-indigo-500 dark:text-indigo-300">
              Keep calm and let the alts flow.
            </p>
          </div>
          <ThemeToggle />
        </div>

        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Choose a role
        </h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Every party sees the same transaction from a different side. Pick one to enter.
        </p>

        {error && (
          <p className="mt-4 rounded bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        )}

        {!personas && !error && (
          <p className="mt-4 text-sm text-slate-400 dark:text-slate-500">Loading roles…</p>
        )}

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {personas?.map((p) => {
            const visual = ROLE_VISUALS[p.email] ?? DEFAULT_VISUAL;
            const Icon = visual.icon;
            return (
              <button
                key={p.email}
                type="button"
                disabled={pending !== null}
                onClick={() => enterAs(p.email)}
                className="group flex flex-col items-start gap-3 rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md disabled:opacity-50 disabled:hover:translate-y-0 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-600"
              >
                <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg [&_svg]:h-5 [&_svg]:w-5 ${visual.badge}`}>
                  <Icon />
                </span>
                <div>
                  <div className="text-base font-semibold text-slate-900 dark:text-slate-100">{p.label}</div>
                  <p className="mt-1 text-sm leading-relaxed text-slate-500 dark:text-slate-400">{p.description}</p>
                </div>
                <span className="text-xs font-medium text-slate-400 transition group-hover:text-slate-700 dark:text-slate-500 dark:group-hover:text-slate-200">
                  {pending === p.email ? "Entering…" : "Enter →"}
                </span>
              </button>
            );
          })}
        </div>

        <p className="mt-6 text-center text-xs text-slate-400 dark:text-slate-500">
          Demonstration environment — no password required, and all data is synthetic.
        </p>
      </div>

      <div className="w-full max-w-5xl">
        <div className="mb-3 text-center">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            How a security actually moves
          </h2>
          <p className="mx-auto mt-1 max-w-xl text-sm text-slate-500 dark:text-slate-400">
            Whichever role you pick above is one stop on this chain. Toggle to the extended
            version for the full picture, or click through the short one below.
          </p>
        </div>
        <SettlementChainDiagram />
      </div>

      <div className="w-full">
        <SiteFooter />
      </div>
    </div>
  );
}
