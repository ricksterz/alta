import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import type { LpView } from "../../lib/types";

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  pending_investor_data: "Awaiting your data",
  pending_signatures: "Awaiting signatures",
  pending_gp_countersign: "Awaiting GP countersign",
  pending_fund_admin_review: "In fund admin review",
  accepted: "Accepted",
  rejected: "Rejected",
  funded: "Funded",
};

function money(v: string | null) {
  return v
    ? Number(v).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })
    : "—";
}

// Public, unauthenticated page — reached via a bearer link an advisor shares
// with an LP, not a login. No Layout/nav chrome: this is not a member of the
// internal app, just a read-only window onto one investor's own standing.
export function LpViewPage() {
  const { token } = useParams<{ token: string }>();
  const [view, setView] = useState<LpView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api
      .get<LpView>(`/lp/${token}`)
      .then(setView)
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : "This link is invalid or has expired")
      );
  }, [token]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-800">
      <header className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="mx-auto max-w-4xl px-6 py-4">
          <span className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">Alta</span>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8">
        {error && (
          <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950 px-4 py-6 text-center text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {!error && !view && <p className="text-slate-500 dark:text-slate-400">Loading…</p>}

        {view && (
          <>
            <div className="mb-6">
              <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{view.investor.displayName}</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 capitalize">{view.investor.type}</p>
            </div>

            <section className="mb-6 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Holdings
              </h2>
              {view.positions.length === 0 ? (
                <p className="text-sm text-slate-400 dark:text-slate-500">No holdings yet.</p>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="text-xs uppercase text-slate-400 dark:text-slate-500">
                    <tr>
                      <th className="py-2">Fund</th>
                      <th className="py-2">Committed</th>
                      <th className="py-2">Funded</th>
                      <th className="py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {view.positions.map((p) => (
                      <tr key={p.id}>
                        <td className="py-2 font-medium text-slate-800 dark:text-slate-200">{p.fundName}</td>
                        <td className="py-2 tabular-nums text-slate-600 dark:text-slate-400">{money(p.commitmentAmount)}</td>
                        <td className="py-2 tabular-nums text-slate-600 dark:text-slate-400">{money(p.fundedAmount)}</td>
                        <td className="py-2 capitalize text-slate-600 dark:text-slate-400">{p.status.replace(/_/g, " ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Subscriptions
              </h2>
              {view.subscriptions.length === 0 ? (
                <p className="text-sm text-slate-400 dark:text-slate-500">No subscriptions yet.</p>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="text-xs uppercase text-slate-400 dark:text-slate-500">
                    <tr>
                      <th className="py-2">Fund</th>
                      <th className="py-2">Amount</th>
                      <th className="py-2">Status</th>
                      <th className="py-2">Started</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {view.subscriptions.map((s) => (
                      <tr key={s.id}>
                        <td className="py-2 font-medium text-slate-800 dark:text-slate-200">{s.fundName}</td>
                        <td className="py-2 tabular-nums text-slate-600 dark:text-slate-400">{money(s.amount)}</td>
                        <td className="py-2 text-slate-600 dark:text-slate-400">{STATUS_LABELS[s.status] ?? s.status}</td>
                        <td className="py-2 text-slate-600 dark:text-slate-400">{new Date(s.createdAt).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <p className="mt-6 text-center text-xs text-slate-400 dark:text-slate-500">
              This is a read-only view generated for you by your advisor. Contact them with any
              questions.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
