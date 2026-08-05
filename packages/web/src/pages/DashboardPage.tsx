import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import type { InvestorListItem } from "../lib/types";

const TYPE_LABELS: Record<string, string> = {
  individual: "Individual",
  joint: "Joint",
  entity: "Entity",
  trust: "Trust",
};

function StatusSummary({ counts }: { counts: InvestorListItem["subscriptionStatusCounts"] }) {
  const entries = Object.entries(counts);
  if (entries.length === 0) {
    return <span className="text-slate-400">No subscriptions</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {entries.map(([status, count]) => (
        <span
          key={status}
          className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600"
        >
          {status.replace(/_/g, " ")}: {count}
        </span>
      ))}
    </div>
  );
}

export function DashboardPage() {
  const [investors, setInvestors] = useState<InvestorListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<InvestorListItem[]>("/investors")
      .then(setInvestors)
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Investors</h1>
        <Link
          to="/investors/new"
          className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          + New investor
        </Link>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {investors && investors.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-300 py-16 text-center text-slate-500">
          No investors yet. Start the onboarding wizard to add one.
        </div>
      )}

      {investors && investors.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Accreditation</th>
                <th className="px-4 py-3">Subscriptions</th>
                <th className="px-4 py-3">Added</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {investors.map((inv) => (
                <tr key={inv.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link to={`/investors/${inv.id}`} className="font-medium text-slate-900 hover:underline">
                      {inv.displayName || "(unnamed)"}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{TYPE_LABELS[inv.type]}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {inv.accreditationBasis ? (
                      <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        Set
                      </span>
                    ) : (
                      <span className="rounded bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                        Pending
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="mr-2 text-slate-500">{inv.subscriptionCount}</span>
                    <StatusSummary counts={inv.subscriptionStatusCounts} />
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {new Date(inv.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
