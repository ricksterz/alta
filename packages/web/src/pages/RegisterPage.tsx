import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../auth/AuthContext";
import type { PositionListItem } from "../lib/types";

const TOKEN_STYLES: Record<string, string> = {
  none: "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400",
  pending: "bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300",
  minted: "bg-violet-50 dark:bg-violet-950 text-violet-700 dark:text-violet-300",
  frozen: "bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300",
};

function shortAddress(a: string | null) {
  if (!a) return null;
  return a.length > 14 ? `${a.slice(0, 8)}…${a.slice(-6)}` : a;
}

export function RegisterPage() {
  const { user } = useAuth();
  const isSponsor = user?.tenantType === "sponsor_firm";
  const [positions, setPositions] = useState<PositionListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<PositionListItem[]>("/positions")
      .then(setPositions)
      .catch((err) => setError(err.message));
  }, []);

  const total = positions?.reduce((sum, p) => sum + Number(p.commitmentAmount), 0) ?? 0;
  const tokenized = positions?.filter((p) => p.tokenization === "minted").length ?? 0;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Holder register</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Positions opened when a subscription funds.{" "}
          {isSponsor
            ? "Holders across every advisor firm subscribing to your funds."
            : "Your firm's holdings."}
        </p>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-300">{error}</p>}

      {positions && positions.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-4">
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-5 py-4">
            <div className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">Positions</div>
            <div className="text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
              {positions.length}
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-5 py-4">
            <div className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">Committed</div>
            <div className="text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
              {total.toLocaleString("en-US", {
                style: "currency",
                currency: "USD",
                maximumFractionDigits: 0,
              })}
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-5 py-4">
            <div className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">Tokenized</div>
            <div className="text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">{tokenized}</div>
          </div>
        </div>
      )}

      {positions && positions.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 py-16 text-center text-slate-500 dark:text-slate-400">
          No positions yet. A position opens when a subscription reaches funded.
        </div>
      )}

      {positions && positions.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800 text-xs uppercase text-slate-500 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3">Holder</th>
                <th className="px-4 py-3">Fund</th>
                <th className="px-4 py-3">Commitment</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">On chain</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {positions.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800">
                  <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                    {p.investor.displayName}
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{p.fund.name}</td>
                  <td className="px-4 py-3 tabular-nums text-slate-600 dark:text-slate-400">
                    {Number(p.commitmentAmount).toLocaleString("en-US", {
                      style: "currency",
                      currency: "USD",
                      maximumFractionDigits: 0,
                    })}
                  </td>
                  <td className="px-4 py-3 capitalize text-slate-600 dark:text-slate-400">
                    {p.status.replace(/_/g, " ")}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${TOKEN_STYLES[p.tokenization]}`}
                    >
                      {p.tokenization === "none" ? "not tokenized" : p.tokenization}
                    </span>
                    {p.tokenization !== "none" && (
                      <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                        {[p.tokenStandard, p.chain].filter(Boolean).join(" · ")}
                        {p.tokenId && ` · #${p.tokenId}`}
                        {p.holderWalletAddress && (
                          <div className="font-mono">{shortAddress(p.holderWalletAddress)}</div>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 text-xs text-slate-400 dark:text-slate-500">
        On-chain fields are record-keeping. AltsFlow records where an interest is represented and
        answers transfer-compliance questions about it; it does not custody keys, sign
        transactions, or broadcast to any chain.
      </p>
    </div>
  );
}
