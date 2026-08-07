import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import type { AvailableFund, InvestorListItem } from "../../lib/types";

const VEHICLE_LABELS: Record<string, string> = {
  lp: "LP",
  llc_feeder: "LLC Feeder",
  interval_fund: "Interval Fund",
  non_traded_bdc: "Non-Traded BDC",
  evergreen: "Evergreen",
};

export function NewSubscriptionPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const presetInvestorId = params.get("investorId") ?? "";

  const [investors, setInvestors] = useState<InvestorListItem[]>([]);
  const [funds, setFunds] = useState<AvailableFund[]>([]);
  const [investorId, setInvestorId] = useState(presetInvestorId);
  const [fundId, setFundId] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get<InvestorListItem[]>("/investors").then(setInvestors).catch(() => setInvestors([]));
    api
      .get<AvailableFund[]>("/subscriptions/available-funds")
      .then(setFunds)
      .catch((err) => setError(err.message));
  }, []);

  const selectedFund = funds.find((f) => f.id === fundId);
  const selectedInvestor = investors.find((i) => i.id === investorId);
  const investorNotReady = selectedInvestor && !selectedInvestor.accreditationBasis;

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      const sub = await api.post<{ id: string }>("/subscriptions", {
        investorId,
        fundId,
        amount: Number(amount),
      });
      navigate(`/subscriptions/${sub.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start subscription");
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = investorId && fundId && Number(amount) > 0 && !investorNotReady && selectedFund?.hasTemplate;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 text-2xl font-semibold text-slate-900">New subscription</h1>
      <p className="mb-6 text-sm text-slate-500">
        Reuse an existing investor profile and select a fund your firm is entitled to offer.
      </p>

      {error && <p className="mb-4 rounded bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <div className="space-y-5 rounded-lg border border-slate-200 bg-white p-6">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Investor</label>
          <select
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            value={investorId}
            onChange={(e) => setInvestorId(e.target.value)}
          >
            <option value="">Select an existing investor…</option>
            {investors.map((i) => (
              <option key={i.id} value={i.id}>
                {i.displayName} · {i.type}
              </option>
            ))}
          </select>
          {investorNotReady && (
            <p className="mt-1 text-xs text-amber-700">
              This investor hasn't completed accreditation yet — finish onboarding before subscribing.
            </p>
          )}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Fund</label>
          {funds.length === 0 ? (
            <p className="rounded border border-dashed border-slate-300 px-3 py-4 text-sm text-slate-500">
              No funds available. A fund sponsor has to grant your firm access before you can subscribe.
            </p>
          ) : (
            <select
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
              value={fundId}
              onChange={(e) => setFundId(e.target.value)}
            >
              <option value="">Select a fund…</option>
              {funds.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} · {VEHICLE_LABELS[f.vehicleType]}
                </option>
              ))}
            </select>
          )}

          {selectedFund && (
            <div className="mt-2 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <div>{selectedFund.legalName ?? selectedFund.name}</div>
              <div className="mt-1">
                {selectedFund.structure} ·{" "}
                {selectedFund.minInvestment
                  ? `min ${Number(selectedFund.minInvestment).toLocaleString("en-US", {
                      style: "currency",
                      currency: "USD",
                      maximumFractionDigits: 0,
                    })}`
                  : "no minimum"}
              </div>
              {!selectedFund.hasTemplate && (
                <div className="mt-1 text-amber-700">
                  This fund has no subscription document template yet — the sponsor must upload one first.
                </div>
              )}
              {selectedFund.hasTemplate && selectedFund.templateUnmappedFieldCount > 0 && (
                <div className="mt-1 text-amber-700">
                  {selectedFund.templateUnmappedFieldCount} template field(s) are unmapped — those will be
                  blank on the generated document.
                </div>
              )}
            </div>
          )}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Subscription amount</label>
          <input
            type="number"
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            placeholder="500000"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          {selectedFund?.minInvestment && Number(amount) > 0 &&
            Number(amount) < Number(selectedFund.minInvestment) && (
              <p className="mt-1 text-xs text-amber-700">
                Below this fund's minimum of{" "}
                {Number(selectedFund.minInvestment).toLocaleString("en-US", {
                  style: "currency",
                  currency: "USD",
                  maximumFractionDigits: 0,
                })}
                .
              </p>
            )}
        </div>

        <div className="flex justify-end pt-1">
          <button
            type="button"
            disabled={!canSubmit || submitting}
            onClick={submit}
            className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-40"
          >
            {submitting ? "Starting…" : "Start subscription"}
          </button>
        </div>
      </div>
    </div>
  );
}
