import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { useAuth } from "../../auth/AuthContext";
import { StatusBadge } from "../../components/StatusBadge";
import type { SubscriptionListItem } from "../../lib/types";

// Statuses that mean "someone on my side has to do something." Surfacing this
// as the default filter is the difference between a queue and a list.
const ACTIONABLE_FOR_SPONSOR = new Set(["pending_gp_countersign", "pending_fund_admin_review"]);
const ACTIONABLE_FOR_FUND_ADMIN = new Set(["pending_fund_admin_review", "accepted"]);

export function SubscriptionsQueuePage() {
  const { user } = useAuth();
  const isSponsor = user?.tenantType === "sponsor_firm";
  const isFundAdmin = user?.tenantType === "fund_admin";
  const isReviewer = isSponsor || isFundAdmin;
  const [subs, setSubs] = useState<SubscriptionListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onlyActionable, setOnlyActionable] = useState(isReviewer);

  useEffect(() => {
    api
      .get<SubscriptionListItem[]>("/subscriptions")
      .then(setSubs)
      .catch((err) => setError(err.message));
  }, []);

  const actionable = isFundAdmin ? ACTIONABLE_FOR_FUND_ADMIN : ACTIONABLE_FOR_SPONSOR;
  const visible = subs?.filter((s) => !onlyActionable || actionable.has(s.status));
  const actionableCount = subs?.filter((s) => actionable.has(s.status)).length ?? 0;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Subscriptions</h1>
          {isReviewer && (
            <p className="text-sm text-slate-500">
              {actionableCount === 0
                ? "Nothing waiting on you."
                : `${actionableCount} waiting on you.`}
            </p>
          )}
        </div>
        {!isReviewer && (
          <Link
            to="/subscriptions/new"
            className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            + New subscription
          </Link>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {subs && subs.length > 0 && (
        <label className="mb-4 flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={onlyActionable}
            onChange={(e) => setOnlyActionable(e.target.checked)}
          />
          Only show items awaiting my action
        </label>
      )}

      {visible && visible.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-300 py-16 text-center text-slate-500">
          {subs && subs.length > 0
            ? "Nothing awaiting your action right now."
            : "No subscriptions yet."}
        </div>
      )}

      {visible && visible.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Investor</th>
                <th className="px-4 py-3">Fund</th>
                {isReviewer && <th className="px-4 py-3">Advisor firm</th>}
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link
                      to={`/subscriptions/${s.id}`}
                      className="font-medium text-slate-900 hover:underline"
                    >
                      {s.investor.displayName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{s.fund.name}</td>
                  {isReviewer && <td className="px-4 py-3 text-slate-600">{s.advisorFirm}</td>}
                  <td className="px-4 py-3 tabular-nums text-slate-600">
                    {s.amount
                      ? Number(s.amount).toLocaleString("en-US", {
                          style: "currency",
                          currency: "USD",
                          maximumFractionDigits: 0,
                        })
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={s.status} />
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
