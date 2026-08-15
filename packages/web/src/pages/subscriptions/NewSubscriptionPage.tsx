import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import type { AvailableFund, EligibilityResult, InvestorListItem } from "../../lib/types";

const EXCLUSION_LABELS: Record<string, string> = {
  section_3c1: "3(c)(1) — accredited investors, capped at 100 holders",
  section_3c7: "3(c)(7) — qualified purchasers only",
};

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
  const [shareClassId, setShareClassId] = useState("");
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
  const selectedShareClass = selectedFund?.shareClasses.find((c) => c.id === shareClassId);
  const selectedInvestor = investors.find((i) => i.id === investorId);
  const investorNotReady = selectedInvestor && !selectedInvestor.accreditationBasis;
  const effectiveMinInvestment = selectedShareClass?.minInvestment ?? selectedFund?.minInvestment ?? null;

  // Ask the server rather than reimplementing the rules here — the same engine
  // that will authorize the POST, so the warning can't disagree with the block.
  const [eligibility, setEligibility] = useState<EligibilityResult | null>(null);
  useEffect(() => {
    if (!investorId || !fundId) {
      setEligibility(null);
      return;
    }
    let cancelled = false;
    api
      .get<EligibilityResult>(
        `/subscriptions/eligibility?investorId=${investorId}&fundId=${fundId}`
      )
      .then((r) => !cancelled && setEligibility(r))
      .catch(() => !cancelled && setEligibility(null));
    return () => {
      cancelled = true;
    };
  }, [investorId, fundId]);

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      const sub = await api.post<{ id: string }>("/subscriptions", {
        investorId,
        fundId,
        amount: Number(amount),
        shareClassId: shareClassId || undefined,
      });
      navigate(`/subscriptions/${sub.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start subscription");
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit =
    investorId &&
    fundId &&
    Number(amount) > 0 &&
    !investorNotReady &&
    selectedFund?.hasTemplate &&
    eligibility?.eligible !== false;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">New subscription</h1>
      <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
        Reuse an existing investor profile and select a fund your firm is entitled to offer.
      </p>

      {error && <p className="mb-4 rounded bg-red-50 dark:bg-red-950 px-3 py-2 text-sm text-red-600 dark:text-red-300">{error}</p>}

      <div className="space-y-5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Investor</label>
          <select
            className="w-full rounded border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm focus:border-slate-500 dark:focus:border-slate-400 focus:outline-none"
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
            <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
              This investor hasn't completed accreditation yet — finish onboarding before subscribing.
            </p>
          )}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Fund</label>
          {funds.length === 0 ? (
            <p className="rounded border border-dashed border-slate-300 dark:border-slate-700 px-3 py-4 text-sm text-slate-500 dark:text-slate-400">
              No funds available. A fund sponsor has to grant your firm access before you can subscribe.
            </p>
          ) : (
            <select
              className="w-full rounded border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm focus:border-slate-500 dark:focus:border-slate-400 focus:outline-none"
              value={fundId}
              onChange={(e) => {
                setFundId(e.target.value);
                setShareClassId("");
              }}
            >
              <option value="">Select a fund…</option>
              {funds.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} · {VEHICLE_LABELS[f.vehicleType]}
                </option>
              ))}
            </select>
          )}

          {selectedFund && selectedFund.shareClasses.length > 0 && (
            <div className="mt-2">
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Share class</label>
              <select
                className="w-full rounded border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm focus:border-slate-500 dark:focus:border-slate-400 focus:outline-none"
                value={shareClassId}
                onChange={(e) => setShareClassId(e.target.value)}
              >
                <option value="">Fund's default terms</option>
                {selectedFund.shareClasses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.managementFeeRate && ` · ${(Number(c.managementFeeRate) * 100).toFixed(2)}% mgmt fee`}
                  </option>
                ))}
              </select>
            </div>
          )}

          {selectedFund && (
            <div className="mt-2 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs text-slate-600 dark:text-slate-400">
              <div>{selectedFund.legalName ?? selectedFund.name}</div>
              <div className="mt-1">
                {selectedFund.structure} ·{" "}
                {effectiveMinInvestment
                  ? `min ${Number(effectiveMinInvestment).toLocaleString("en-US", {
                      style: "currency",
                      currency: "USD",
                      maximumFractionDigits: 0,
                    })}`
                  : "no minimum"}
              </div>
              {(selectedFund.managementFeeRate || selectedFund.carriedInterestRate) && (
                <div className="mt-1">
                  {selectedFund.managementFeeRate &&
                    `${(Number(selectedShareClass?.managementFeeRate ?? selectedFund.managementFeeRate) * 100).toFixed(2)}% management fee`}
                  {selectedFund.carriedInterestRate &&
                    ` · ${(Number(selectedShareClass?.carriedInterestRate ?? selectedFund.carriedInterestRate) * 100).toFixed(2)}% carry`}
                  {selectedFund.hurdleRate && ` · ${(Number(selectedFund.hurdleRate) * 100).toFixed(2)}% hurdle`}
                </div>
              )}
              {!selectedFund.hasTemplate && (
                <div className="mt-1 text-amber-700 dark:text-amber-300">
                  This fund has no subscription document template yet — the sponsor must upload one first.
                </div>
              )}
              {selectedFund.exclusion && (
                <div className="mt-1">{EXCLUSION_LABELS[selectedFund.exclusion]}</div>
              )}
              {selectedFund.domicile && <div className="mt-1">Domiciled in {selectedFund.domicile}</div>}
              {selectedFund.hasTemplate && selectedFund.templateUnmappedFieldCount > 0 && (
                <div className="mt-1 text-amber-700 dark:text-amber-300">
                  {selectedFund.templateUnmappedFieldCount} template field(s) are unmapped — those will be
                  blank on the generated document.
                </div>
              )}
            </div>
          )}
        </div>

        {eligibility && eligibility.blockers.length > 0 && (
          <div className="rounded border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950 px-3 py-3">
            <p className="mb-1 text-sm font-medium text-red-800 dark:text-red-200">
              This investor is not eligible for this fund
            </p>
            <ul className="space-y-1 text-xs text-red-700 dark:text-red-300">
              {eligibility.blockers.map((b) => (
                <li key={b.code}>{b.message}</li>
              ))}
            </ul>
          </div>
        )}

        {eligibility && eligibility.warnings.length > 0 && (
          <div className="rounded border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950 px-3 py-3">
            <ul className="space-y-1 text-xs text-amber-800 dark:text-amber-200">
              {eligibility.warnings.map((w) => (
                <li key={w.code}>{w.message}</li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Subscription amount</label>
          <input
            type="number"
            className="w-full rounded border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm focus:border-slate-500 dark:focus:border-slate-400 focus:outline-none"
            placeholder="500000"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          {effectiveMinInvestment && Number(amount) > 0 &&
            Number(amount) < Number(effectiveMinInvestment) && (
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                Below this fund's minimum of{" "}
                {Number(effectiveMinInvestment).toLocaleString("en-US", {
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
            className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white disabled:opacity-40"
          >
            {submitting ? "Starting…" : "Start subscription"}
          </button>
        </div>
      </div>
    </div>
  );
}
