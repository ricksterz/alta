import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { api, ApiError } from "../lib/api";
import { ThemeToggle } from "../components/ThemeToggle";
import { SettlementChainDiagram } from "../components/SettlementChainDiagram";

// Role selection rather than credentials. Alta is a multi-party product —
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
      <div className="w-full max-w-lg">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
              AltsFlow
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Subscription document execution for alternative investments.
            </p>
          </div>
          <ThemeToggle />
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
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

          <ul className="mt-4 space-y-2">
            {personas?.map((p) => (
              <li key={p.email}>
                <button
                  type="button"
                  disabled={pending !== null}
                  onClick={() => enterAs(p.email)}
                  className="w-full rounded border border-slate-200 px-4 py-3 text-left transition hover:border-slate-400 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:hover:border-slate-500 dark:hover:bg-slate-800"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      {p.label}
                    </span>
                    <span className="shrink-0 text-xs text-slate-400 dark:text-slate-500">
                      {pending === p.email ? "Entering…" : "Enter →"}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{p.description}</p>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <p className="mt-4 text-center text-xs text-slate-400 dark:text-slate-500">
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
    </div>
  );
}
