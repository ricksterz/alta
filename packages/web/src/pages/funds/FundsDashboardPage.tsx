import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import type { FundListItem } from "../../lib/types";

const VEHICLE_LABELS: Record<string, string> = {
  lp: "LP",
  llc_feeder: "LLC Feeder",
  interval_fund: "Interval Fund",
  non_traded_bdc: "Non-Traded BDC",
  evergreen: "Evergreen",
};

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400",
  active: "bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300",
  closed: "bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300",
};

const STRATEGY_LABELS: Record<string, string> = {
  buyout: "Buyout",
  growth_equity: "Growth equity",
  venture: "Venture",
  credit: "Credit",
  real_estate: "Real estate",
  infrastructure: "Infrastructure",
  secondaries: "Secondaries",
  fund_of_funds: "Fund of funds",
  other: "Other",
};

export function FundsDashboardPage() {
  const [funds, setFunds] = useState<FundListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<FundListItem[]>("/funds")
      .then(setFunds)
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Funds</h1>
        <Link
          to="/funds/new"
          className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
        >
          + New fund
        </Link>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-300">{error}</p>}

      {funds && funds.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 py-16 text-center text-slate-500 dark:text-slate-400">
          No funds yet. Create one to start uploading subscription document templates.
        </div>
      )}

      {funds && funds.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800 text-xs uppercase text-slate-500 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Vehicle</th>
                <th className="px-4 py-3">Strategy</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Min. investment</th>
                <th className="px-4 py-3">Advisor entitlements</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {funds.map((fund) => (
                <tr key={fund.id} className="hover:bg-slate-50 dark:hover:bg-slate-800">
                  <td className="px-4 py-3">
                    <Link to={`/funds/${fund.id}`} className="font-medium text-slate-900 dark:text-slate-100 hover:underline">
                      {fund.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                    {VEHICLE_LABELS[fund.vehicleType]}
                    <span className="ml-2 text-xs text-slate-400 dark:text-slate-500">{fund.structure}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                    {fund.strategy ? STRATEGY_LABELS[fund.strategy] : "—"}
                    {fund.vintageYear && <span className="ml-2 text-xs text-slate-400 dark:text-slate-500">{fund.vintageYear}</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[fund.status]}`}>
                      {fund.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                    {fund.minInvestment ? `$${Number(fund.minInvestment).toLocaleString()}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                    {fund.activeEntitlementCount} active
                    {fund.totalEntitlementCount !== fund.activeEntitlementCount && (
                      <span className="text-slate-400 dark:text-slate-500"> / {fund.totalEntitlementCount} total</span>
                    )}
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
