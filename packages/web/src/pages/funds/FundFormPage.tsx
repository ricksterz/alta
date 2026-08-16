import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import type { FundAssetClass, FundStrategyType, FundStructure, FundVehicleType } from "../../lib/types";

function inputClass() {
  return "w-full rounded border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm focus:border-slate-500 dark:focus:border-slate-400 focus:outline-none";
}
function labelClass() {
  return "mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300";
}

export function FundFormPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [legalName, setLegalName] = useState("");
  const [vehicleType, setVehicleType] = useState<FundVehicleType>("lp");
  const [structure, setStructure] = useState<FundStructure>("drawdown");
  const [minInvestment, setMinInvestment] = useState("");
  const [closeDate, setCloseDate] = useState("");
  const [gpSignatoryName, setGpSignatoryName] = useState("");
  const [vintageYear, setVintageYear] = useState("");
  const [assetClass, setAssetClass] = useState<FundAssetClass | "">("");
  const [strategy, setStrategy] = useState<FundStrategyType | "">("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const fund = await api.post<{ id: string }>("/funds", {
        name,
        legalName: legalName || undefined,
        vehicleType,
        structure,
        minInvestment: minInvestment ? Number(minInvestment) : undefined,
        closeDate: structure === "drawdown" && closeDate ? new Date(closeDate).toISOString() : undefined,
        gpSignatoryName: gpSignatoryName || undefined,
        vintageYear: vintageYear ? Number(vintageYear) : undefined,
        assetClass: assetClass || undefined,
        strategy: strategy || undefined,
      });
      navigate(`/funds/${fund.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create fund");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-6 text-2xl font-semibold text-slate-900 dark:text-slate-100">New fund</h1>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
        {error && <p className="rounded bg-red-50 dark:bg-red-950 px-3 py-2 text-sm text-red-600 dark:text-red-300">{error}</p>}

        <div>
          <label className={labelClass()}>Fund name</label>
          <input className={inputClass()} value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <label className={labelClass()}>Legal name</label>
          <input
            className={inputClass()}
            placeholder="Meridian Growth Fund III, LP"
            value={legalName}
            onChange={(e) => setLegalName(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass()}>Vehicle type</label>
            <select
              className={inputClass()}
              value={vehicleType}
              onChange={(e) => setVehicleType(e.target.value as FundVehicleType)}
            >
              <option value="lp">LP</option>
              <option value="llc_feeder">LLC Feeder</option>
              <option value="interval_fund">Interval Fund</option>
              <option value="non_traded_bdc">Non-Traded BDC</option>
              <option value="evergreen">Evergreen</option>
            </select>
          </div>
          <div>
            <label className={labelClass()}>Structure</label>
            <select
              className={inputClass()}
              value={structure}
              onChange={(e) => setStructure(e.target.value as FundStructure)}
            >
              <option value="drawdown">Drawdown</option>
              <option value="continuous">Continuous</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className={labelClass()}>Vintage year</label>
            <input
              type="number"
              className={inputClass()}
              placeholder="2026"
              value={vintageYear}
              onChange={(e) => setVintageYear(e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass()}>Asset class</label>
            <select
              className={inputClass()}
              value={assetClass}
              onChange={(e) => setAssetClass(e.target.value as FundAssetClass | "")}
            >
              <option value="">Select…</option>
              <option value="private_equity">Private equity</option>
              <option value="venture_capital">Venture capital</option>
              <option value="private_credit">Private credit</option>
              <option value="real_estate">Real estate</option>
              <option value="infrastructure">Infrastructure</option>
              <option value="hedge_fund">Hedge fund</option>
              <option value="fund_of_funds">Fund of funds</option>
            </select>
          </div>
          <div>
            <label className={labelClass()}>Strategy</label>
            <select
              className={inputClass()}
              value={strategy}
              onChange={(e) => setStrategy(e.target.value as FundStrategyType | "")}
            >
              <option value="">Select…</option>
              <option value="buyout">Buyout</option>
              <option value="growth_equity">Growth equity</option>
              <option value="venture">Venture</option>
              <option value="credit">Credit</option>
              <option value="real_estate">Real estate</option>
              <option value="infrastructure">Infrastructure</option>
              <option value="secondaries">Secondaries</option>
              <option value="fund_of_funds">Fund of funds</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass()}>Minimum investment</label>
            <input
              type="number"
              className={inputClass()}
              placeholder="250000"
              value={minInvestment}
              onChange={(e) => setMinInvestment(e.target.value)}
            />
          </div>
          {structure === "drawdown" && (
            <div>
              <label className={labelClass()}>Close date</label>
              <input
                type="date"
                className={inputClass()}
                value={closeDate}
                onChange={(e) => setCloseDate(e.target.value)}
              />
            </div>
          )}
        </div>

        <div>
          <label className={labelClass()}>GP signatory name</label>
          <input
            className={inputClass()}
            placeholder="Who signs subscription docs on the GP's behalf, by default"
            value={gpSignatoryName}
            onChange={(e) => setGpSignatoryName(e.target.value)}
          />
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
            Can be overridden per template as a static field mapping.
          </p>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={submitting}
            className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white disabled:opacity-50"
          >
            {submitting ? "Creating…" : "Create fund"}
          </button>
        </div>
      </form>
    </div>
  );
}
