import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import type { AdvisorTenantSummary, FundDetail } from "../../lib/types";

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

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!fund) return <p className="text-slate-500">Loading…</p>;

  const alreadyGrantedIds = new Set(fund.advisorEntitlements.map((e) => e.advisorTenant.id));

  return (
    <div>
      <Link to="/funds" className="mb-4 inline-block text-sm text-slate-500 hover:underline">
        ← Back to funds
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">{fund.name}</h1>
        <p className="text-sm text-slate-500">
          {fund.vehicleType} · {fund.structure} · {fund.status}
          {fund.minInvestment && ` · min $${Number(fund.minInvestment).toLocaleString()}`}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* --- Document templates --- */}
        <section className="rounded-lg border border-slate-200 bg-white p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Document templates
          </h2>

          <label className="mb-4 block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Upload subscription PDF</span>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              onChange={handleUpload}
              disabled={uploading}
              className="block w-full text-sm text-slate-600"
            />
            {uploading && <p className="mt-1 text-xs text-slate-400">Uploading and detecting fields…</p>}
            {uploadError && <p className="mt-1 text-xs text-red-600">{uploadError}</p>}
          </label>

          {fund.documentTemplates.length === 0 ? (
            <p className="text-sm text-slate-400">No templates uploaded yet.</p>
          ) : (
            <ul className="space-y-2">
              {fund.documentTemplates.map((t) => (
                <li key={t.id}>
                  <Link
                    to={`/templates/${t.id}`}
                    className="flex items-center justify-between rounded border border-slate-200 px-3 py-2 hover:bg-slate-50"
                  >
                    <span className="text-sm font-medium text-slate-800">{t.originalFilename}</span>
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${
                        t.unmappedFieldCount > 0
                          ? "bg-amber-50 text-amber-700"
                          : "bg-emerald-50 text-emerald-700"
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
        <section className="rounded-lg border border-slate-200 bg-white p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Advisor entitlements
          </h2>

          <div className="relative mb-4">
            <input
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
              placeholder="Search advisor firms to grant access…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {searchResults.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full rounded border border-slate-200 bg-white shadow-sm">
                {searchResults.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => grant(t.id)}
                      disabled={alreadyGrantedIds.has(t.id)}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:text-slate-300"
                    >
                      {t.name}
                      <span className="text-xs text-slate-400">
                        {alreadyGrantedIds.has(t.id) ? "already granted" : "grant"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {grantError && <p className="mb-3 text-xs text-red-600">{grantError}</p>}

          {fund.advisorEntitlements.length === 0 ? (
            <p className="text-sm text-slate-400">No advisor firms entitled yet.</p>
          ) : (
            <ul className="space-y-2">
              {fund.advisorEntitlements.map((e) => (
                <li
                  key={e.id}
                  className="flex items-center justify-between rounded border border-slate-200 px-3 py-2"
                >
                  <span className="text-sm text-slate-800">{e.advisorTenant.name}</span>
                  {e.status === "active" ? (
                    <button
                      type="button"
                      onClick={() => setEntitlementStatus(e.id, "revoked")}
                      className="rounded bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 hover:bg-red-50 hover:text-red-700"
                    >
                      active — revoke
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setEntitlementStatus(e.id, "active")}
                      className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 hover:bg-emerald-50 hover:text-emerald-700"
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
