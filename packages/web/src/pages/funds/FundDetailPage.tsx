import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import type {
  AdvisorTenantSummary,
  FundDetail,
  FundTerms,
  ManagementFeeBasis,
  ShareClassItem,
  WaterfallType,
} from "../../lib/types";

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

function pct(value: string | null): string {
  return value !== null ? `${(Number(value) * 100).toFixed(2)}%` : "—";
}

// Rate inputs are typed as a percentage ("2" meaning 2%) and converted to the
// decimal fraction ("0.02") the API and FundTerms.managementFeeRate expect —
// the same convention resolveFields.ts's formatPercent reverses on the way
// back out onto a generated document.
function toRateFraction(pctInput: string): number | undefined {
  if (!pctInput) return undefined;
  const n = Number(pctInput);
  return Number.isNaN(n) ? undefined : n / 100;
}
function fractionToPctInput(value: string | null): string {
  return value !== null ? String(Number(value) * 100) : "";
}

function TermsEditor({
  fundId,
  terms,
  onSaved,
}: {
  fundId: string;
  terms: FundTerms | null;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [managementFeeRate, setManagementFeeRate] = useState(fractionToPctInput(terms?.managementFeeRate ?? null));
  const [managementFeeBasis, setManagementFeeBasis] = useState<ManagementFeeBasis | "">(
    terms?.managementFeeBasis ?? ""
  );
  const [carriedInterestRate, setCarriedInterestRate] = useState(
    fractionToPctInput(terms?.carriedInterestRate ?? null)
  );
  const [hurdleRate, setHurdleRate] = useState(fractionToPctInput(terms?.hurdleRate ?? null));
  const [waterfallType, setWaterfallType] = useState<WaterfallType | "">(terms?.waterfallType ?? "");
  const [fundTermYears, setFundTermYears] = useState(terms?.fundTermYears?.toString() ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/funds/${fundId}/terms`, {
        managementFeeRate: toRateFraction(managementFeeRate),
        managementFeeBasis: managementFeeBasis || undefined,
        carriedInterestRate: toRateFraction(carriedInterestRate),
        hurdleRate: toRateFraction(hurdleRate),
        waterfallType: waterfallType || undefined,
        fundTermYears: fundTermYears ? Number(fundTermYears) : undefined,
      });
      setEditing(false);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save terms");
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <div>
        {terms ? (
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs uppercase text-slate-400 dark:text-slate-500">Management fee</dt>
              <dd className="font-medium text-slate-800 dark:text-slate-200">
                {pct(terms.managementFeeRate)}
                {terms.managementFeeBasis && (
                  <span className="ml-1 text-xs font-normal text-slate-400 dark:text-slate-500">
                    of {terms.managementFeeBasis.replace(/_/g, " ")}
                  </span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-slate-400 dark:text-slate-500">Carried interest</dt>
              <dd className="font-medium text-slate-800 dark:text-slate-200">{pct(terms.carriedInterestRate)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-slate-400 dark:text-slate-500">Hurdle rate</dt>
              <dd className="font-medium text-slate-800 dark:text-slate-200">{pct(terms.hurdleRate)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-slate-400 dark:text-slate-500">Waterfall</dt>
              <dd className="font-medium capitalize text-slate-800 dark:text-slate-200">{terms.waterfallType ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-slate-400 dark:text-slate-500">Fund term</dt>
              <dd className="font-medium text-slate-800 dark:text-slate-200">
                {terms.fundTermYears ? `${terms.fundTermYears} years` : "—"}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-slate-400 dark:text-slate-500">No economics recorded yet.</p>
        )}
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="mt-4 rounded border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          {terms ? "Edit terms" : "Add terms"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && <p className="rounded bg-red-50 dark:bg-red-950 px-3 py-2 text-xs text-red-600 dark:text-red-300">{error}</p>}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Management fee %</label>
          <input
            type="number"
            step="0.01"
            className="w-full rounded border border-slate-300 dark:border-slate-700 px-2 py-1.5 text-sm"
            placeholder="2.00"
            value={managementFeeRate}
            onChange={(e) => setManagementFeeRate(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Fee basis</label>
          <select
            className="w-full rounded border border-slate-300 dark:border-slate-700 px-2 py-1.5 text-sm"
            value={managementFeeBasis}
            onChange={(e) => setManagementFeeBasis(e.target.value as ManagementFeeBasis | "")}
          >
            <option value="">Select…</option>
            <option value="commitments">Commitments</option>
            <option value="invested_capital">Invested capital</option>
            <option value="nav">NAV</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Carried interest %</label>
          <input
            type="number"
            step="0.01"
            className="w-full rounded border border-slate-300 dark:border-slate-700 px-2 py-1.5 text-sm"
            placeholder="20.00"
            value={carriedInterestRate}
            onChange={(e) => setCarriedInterestRate(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Hurdle rate %</label>
          <input
            type="number"
            step="0.01"
            className="w-full rounded border border-slate-300 dark:border-slate-700 px-2 py-1.5 text-sm"
            placeholder="8.00"
            value={hurdleRate}
            onChange={(e) => setHurdleRate(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Waterfall</label>
          <select
            className="w-full rounded border border-slate-300 dark:border-slate-700 px-2 py-1.5 text-sm"
            value={waterfallType}
            onChange={(e) => setWaterfallType(e.target.value as WaterfallType | "")}
          >
            <option value="">Select…</option>
            <option value="european">European (whole-fund)</option>
            <option value="american">American (deal-by-deal)</option>
            <option value="hybrid">Hybrid</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Fund term (years)</label>
          <input
            type="number"
            className="w-full rounded border border-slate-300 dark:border-slate-700 px-2 py-1.5 text-sm"
            placeholder="10"
            value={fundTermYears}
            onChange={(e) => setFundTermYears(e.target.value)}
          />
        </div>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={save}
          className="rounded bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white disabled:opacity-40"
        >
          {busy ? "Saving…" : "Save terms"}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="rounded border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function ShareClassesPanel({
  fundId,
  shareClasses,
  onSaved,
}: {
  fundId: string;
  shareClasses: ShareClassItem[];
  onSaved: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [minInvestment, setMinInvestment] = useState("");
  const [managementFeeRate, setManagementFeeRate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/funds/${fundId}/share-classes`, {
        name,
        minInvestment: minInvestment ? Number(minInvestment) : undefined,
        managementFeeRate: toRateFraction(managementFeeRate),
      });
      setName("");
      setMinInvestment("");
      setManagementFeeRate("");
      setAdding(false);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create share class");
    } finally {
      setBusy(false);
    }
  }

  async function toggleClosed(shareClass: ShareClassItem) {
    await api.patch(`/funds/${fundId}/share-classes/${shareClass.id}`, {
      closedToNewInvestors: !shareClass.closedToNewInvestors,
    });
    onSaved();
  }

  return (
    <div>
      {shareClasses.length === 0 ? (
        <p className="text-sm text-slate-400 dark:text-slate-500">
          No share classes — this fund offers a single class of interest.
        </p>
      ) : (
        <ul className="space-y-2">
          {shareClasses.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between rounded border border-slate-200 dark:border-slate-800 px-3 py-2"
            >
              <div>
                <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{c.name}</span>
                <span className="ml-2 text-xs text-slate-400 dark:text-slate-500">
                  {c.managementFeeRate ? pct(c.managementFeeRate) : "inherits fund fee"}
                  {c.minInvestment && ` · min $${Number(c.minInvestment).toLocaleString()}`}
                </span>
              </div>
              <button
                type="button"
                onClick={() => toggleClosed(c)}
                className={`rounded px-2 py-0.5 text-xs font-medium ${
                  c.closedToNewInvestors
                    ? "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-emerald-50 dark:hover:bg-emerald-950 hover:text-emerald-700 dark:hover:text-emerald-300"
                    : "bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 hover:bg-red-50 dark:hover:bg-red-950 hover:text-red-700 dark:hover:text-red-300"
                }`}
              >
                {c.closedToNewInvestors ? "closed — reopen" : "open — close"}
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="mt-3 text-xs text-red-600 dark:text-red-300">{error}</p>}

      {adding ? (
        <div className="mt-4 space-y-2 rounded border border-slate-200 dark:border-slate-800 p-3">
          <input
            className="w-full rounded border border-slate-300 dark:border-slate-700 px-2 py-1.5 text-sm"
            placeholder="Class name (e.g. Class I)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              className="w-full rounded border border-slate-300 dark:border-slate-700 px-2 py-1.5 text-sm"
              placeholder="Min investment"
              value={minInvestment}
              onChange={(e) => setMinInvestment(e.target.value)}
            />
            <input
              type="number"
              step="0.01"
              className="w-full rounded border border-slate-300 dark:border-slate-700 px-2 py-1.5 text-sm"
              placeholder="Mgmt fee %"
              value={managementFeeRate}
              onChange={(e) => setManagementFeeRate(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!name.trim() || busy}
              onClick={create}
              className="rounded bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white disabled:opacity-40"
            >
              {busy ? "Adding…" : "Add class"}
            </button>
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="rounded border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mt-4 rounded border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          + Add share class
        </button>
      )}
    </div>
  );
}

function EligibilityTogglesPanel({ fund, onSaved }: { fund: FundDetail; onSaved: () => void }) {
  const [erisaEligible, setErisaEligible] = useState(fund.erisaEligible);
  const [iraEligible, setIraEligible] = useState(fund.iraEligible);
  const [nonUsInvestorsPermitted, setNonUsInvestorsPermitted] = useState(fund.nonUsInvestorsPermitted);
  const [taxExemptEligible, setTaxExemptEligible] = useState(fund.taxExemptEligible);
  const [transferrable, setTransferrable] = useState(fund.transferrable);
  const [gpConsentRequired, setGpConsentRequired] = useState(fund.gpConsentRequired);
  const [rofrApplies, setRofrApplies] = useState(fund.rofrApplies);
  const [lockupMonths, setLockupMonths] = useState(fund.lockupMonths?.toString() ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/funds/${fund.id}`, {
        erisaEligible,
        iraEligible,
        nonUsInvestorsPermitted,
        taxExemptEligible,
        transferrable,
        gpConsentRequired,
        rofrApplies,
        lockupMonths: lockupMonths ? Number(lockupMonths) : undefined,
      });
      setDirty(false);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  function toggle(setter: (v: boolean) => void, current: boolean) {
    setter(!current);
    setDirty(true);
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          Investor eligibility
        </p>
        <div className="space-y-1.5">
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input type="checkbox" checked={erisaEligible} onChange={() => toggle(setErisaEligible, erisaEligible)} />
            Accepts ERISA plans
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input type="checkbox" checked={iraEligible} onChange={() => toggle(setIraEligible, iraEligible)} />
            Accepts IRA investments
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={nonUsInvestorsPermitted}
              onChange={() => toggle(setNonUsInvestorsPermitted, nonUsInvestorsPermitted)}
            />
            Accepts non-US tax residents
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={taxExemptEligible}
              onChange={() => toggle(setTaxExemptEligible, taxExemptEligible)}
            />
            Accepts tax-exempt investors
          </label>
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Transfer terms</p>
        <div className="space-y-1.5">
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input type="checkbox" checked={transferrable} onChange={() => toggle(setTransferrable, transferrable)} />
            Interests may be transferred
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={gpConsentRequired}
              onChange={() => toggle(setGpConsentRequired, gpConsentRequired)}
            />
            GP consent required for transfer
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input type="checkbox" checked={rofrApplies} onChange={() => toggle(setRofrApplies, rofrApplies)} />
            Right of first refusal applies
          </label>
        </div>
        <div className="mt-2 max-w-[10rem]">
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Lock-up (months)</label>
          <input
            type="number"
            className="w-full rounded border border-slate-300 dark:border-slate-700 px-2 py-1.5 text-sm"
            value={lockupMonths}
            onChange={(e) => {
              setLockupMonths(e.target.value);
              setDirty(true);
            }}
          />
        </div>
      </div>

      {error && <p className="text-xs text-red-600 dark:text-red-300">{error}</p>}
      <button
        type="button"
        disabled={!dirty || busy}
        onClick={save}
        className="rounded bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white disabled:opacity-40"
      >
        {busy ? "Saving…" : "Save"}
      </button>
    </div>
  );
}

export function FundDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [fund, setFund] = useState<FundDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<AdvisorTenantSummary[]>([]);
  const [grantError, setGrantError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!id) return;
    api
      .get<FundDetail>(`/funds/${id}`)
      .then(setFund)
      .catch((err) => setError(err.message));
  }, [id]);

  useEffect(load, [load]);

  useEffect(() => {
    if (search.trim().length === 0) {
      setSearchResults([]);
      return;
    }
    const handle = setTimeout(() => {
      api
        .get<AdvisorTenantSummary[]>(`/advisor-tenants?search=${encodeURIComponent(search)}`)
        .then(setSearchResults)
        .catch(() => setSearchResults([]));
    }, 250);
    return () => clearTimeout(handle);
  }, [search]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    setUploading(true);
    setUploadError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      await api.post(`/funds/${id}/templates`, form);
      load();
    } catch (err) {
      setUploadError(err instanceof ApiError ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function grant(advisorTenantId: string) {
    if (!id) return;
    setGrantError(null);
    try {
      await api.post(`/funds/${id}/entitlements`, { advisorTenantId });
      setSearch("");
      setSearchResults([]);
      load();
    } catch (err) {
      setGrantError(err instanceof ApiError ? err.message : "Failed to grant access");
    }
  }

  async function setEntitlementStatus(entitlementId: string, status: "active" | "revoked") {
    if (!id) return;
    await api.patch(`/funds/${id}/entitlements/${entitlementId}`, { status });
    load();
  }

  if (error) return <p className="text-sm text-red-600 dark:text-red-300">{error}</p>;
  if (!fund) return <p className="text-slate-500 dark:text-slate-400">Loading…</p>;

  const alreadyGrantedIds = new Set(fund.advisorEntitlements.map((e) => e.advisorTenant.id));

  return (
    <div>
      <Link to="/funds" className="mb-4 inline-block text-sm text-slate-500 dark:text-slate-400 hover:underline">
        ← Back to funds
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{fund.name}</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {fund.vehicleType} · {fund.structure} · {fund.status}
          {fund.minInvestment && ` · min $${Number(fund.minInvestment).toLocaleString()}`}
          {fund.vintageYear && ` · ${fund.vintageYear} vintage`}
          {fund.strategy && ` · ${STRATEGY_LABELS[fund.strategy] ?? fund.strategy}`}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* --- Terms & economics --- */}
        <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Terms & economics
          </h2>
          <TermsEditor fundId={fund.id} terms={fund.terms} onSaved={load} />
        </section>

        {/* --- Share classes --- */}
        <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Share classes
          </h2>
          <ShareClassesPanel fundId={fund.id} shareClasses={fund.shareClasses} onSaved={load} />
        </section>

        {/* --- Eligibility & transfer terms --- */}
        <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Eligibility & transfer terms
          </h2>
          <EligibilityTogglesPanel fund={fund} onSaved={load} />
        </section>

        {/* --- Document templates --- */}
        <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Document templates
          </h2>

          <label className="mb-4 block">
            <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Upload subscription PDF</span>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              onChange={handleUpload}
              disabled={uploading}
              className="block w-full text-sm text-slate-600 dark:text-slate-400"
            />
            {uploading && <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">Uploading and detecting fields…</p>}
            {uploadError && <p className="mt-1 text-xs text-red-600 dark:text-red-300">{uploadError}</p>}
          </label>

          {fund.documentTemplates.length === 0 ? (
            <p className="text-sm text-slate-400 dark:text-slate-500">No templates uploaded yet.</p>
          ) : (
            <ul className="space-y-2">
              {fund.documentTemplates.map((t) => (
                <li key={t.id}>
                  <Link
                    to={`/templates/${t.id}`}
                    className="flex items-center justify-between rounded border border-slate-200 dark:border-slate-800 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{t.originalFilename}</span>
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${
                        t.unmappedFieldCount > 0
                          ? "bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300"
                          : "bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300"
                      }`}
                    >
                      {t.unmappedFieldCount > 0
                        ? `${t.unmappedFieldCount} of ${t.totalFieldCount} unmapped`
                        : `${t.totalFieldCount} fields mapped`}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* --- Advisor entitlements --- */}
        <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Entitlements
          </h2>

          <div className="relative mb-4">
            <input
              className="w-full rounded border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm focus:border-slate-500 dark:focus:border-slate-400 focus:outline-none"
              placeholder="Search advisor firms or direct investors to grant access…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {searchResults.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
                {searchResults.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => grant(t.id)}
                      disabled={alreadyGrantedIds.has(t.id)}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800 disabled:text-slate-300"
                    >
                      <span>
                        {t.name}
                        {t.type === "investor_direct" && (
                          <span className="ml-2 rounded bg-violet-50 dark:bg-violet-950 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-violet-700 dark:text-violet-300">
                            Direct
                          </span>
                        )}
                      </span>
                      <span className="text-xs text-slate-400 dark:text-slate-500">
                        {alreadyGrantedIds.has(t.id) ? "already granted" : "grant"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {grantError && <p className="mb-3 text-xs text-red-600 dark:text-red-300">{grantError}</p>}

          {fund.advisorEntitlements.length === 0 ? (
            <p className="text-sm text-slate-400 dark:text-slate-500">No advisor firms entitled yet.</p>
          ) : (
            <ul className="space-y-2">
              {fund.advisorEntitlements.map((e) => (
                <li
                  key={e.id}
                  className="flex items-center justify-between rounded border border-slate-200 dark:border-slate-800 px-3 py-2"
                >
                  <span className="text-sm text-slate-800 dark:text-slate-200">{e.advisorTenant.name}</span>
                  {e.status === "active" ? (
                    <button
                      type="button"
                      onClick={() => setEntitlementStatus(e.id, "revoked")}
                      className="rounded bg-emerald-50 dark:bg-emerald-950 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300 hover:bg-red-50 dark:hover:bg-red-950 hover:text-red-700 dark:hover:text-red-300"
                    >
                      active — revoke
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setEntitlementStatus(e.id, "active")}
                      className="rounded bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs font-medium text-slate-500 dark:text-slate-400 hover:bg-emerald-50 dark:hover:bg-emerald-950 hover:text-emerald-700 dark:hover:text-emerald-300"
                    >
                      revoked — reactivate
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
