import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import type { AccessLinkItem, CreatedAccessLink, InvestorDetail } from "../lib/types";
import { ACCREDITATION_BASES } from "../lib/accreditation";
import { StatusBadge } from "../components/StatusBadge";

const ACCESS_LINK_STATUS_META: Record<AccessLinkItem["status"], string> = {
  active: "bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300",
  expired: "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400",
  revoked: "bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300",
};

function AccessLinksPanel({ investorId }: { investorId: string }) {
  const [links, setLinks] = useState<AccessLinkItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [justCreated, setJustCreated] = useState<CreatedAccessLink | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api
      .get<AccessLinkItem[]>(`/investors/${investorId}/access-links`)
      .then(setLinks)
      .catch((err) => setError(err.message));
  }, [investorId]);

  useEffect(load, [load]);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const link = await api.post<CreatedAccessLink>(`/investors/${investorId}/access-links`);
      setJustCreated(link);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create link");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(linkId: string) {
    setError(null);
    try {
      await api.delete(`/investors/${investorId}/access-links/${linkId}`);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to revoke link");
    }
  }

  const linkUrl = justCreated ? `${window.location.origin}/lp/${justCreated.token}` : null;

  return (
    <section className="mt-6 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          LP view-only links
        </h2>
        <button
          type="button"
          disabled={busy}
          onClick={create}
          className="rounded bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white disabled:opacity-40"
        >
          {busy ? "Generating…" : "+ Generate link"}
        </button>
      </div>

      {error && <p className="mb-3 text-xs text-red-600 dark:text-red-300">{error}</p>}

      {linkUrl && (
        <div className="mb-4 rounded border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950 p-3">
          <p className="mb-1 text-xs font-medium text-emerald-800 dark:text-emerald-200">
            Copy this now — it won't be shown again. Expires{" "}
            {new Date(justCreated!.expiresAt).toLocaleDateString()}.
          </p>
          <div className="flex gap-2">
            <input
              readOnly
              value={linkUrl}
              onFocus={(e) => e.currentTarget.select()}
              className="flex-1 rounded border border-emerald-300 dark:border-emerald-800 bg-white dark:bg-slate-900 px-2 py-1.5 text-xs text-slate-700 dark:text-slate-300"
            />
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(linkUrl)}
              className="rounded border border-emerald-300 dark:border-emerald-800 px-3 py-1.5 text-xs font-medium text-emerald-800 dark:text-emerald-200 hover:bg-emerald-100"
            >
              Copy
            </button>
          </div>
        </div>
      )}

      {links && links.length === 0 && <p className="text-sm text-slate-400 dark:text-slate-500">No links generated yet.</p>}

      {links && links.length > 0 && (
        <ul className="space-y-2">
          {links.map((l) => (
            <li
              key={l.id}
              className="flex items-center justify-between rounded border border-slate-200 dark:border-slate-800 px-3 py-2"
            >
              <div className="text-sm text-slate-700 dark:text-slate-300">
                <span className={`mr-2 rounded px-2 py-0.5 text-xs font-medium ${ACCESS_LINK_STATUS_META[l.status]}`}>
                  {l.status}
                </span>
                Created by {l.createdBy} on {new Date(l.createdAt).toLocaleDateString()}
                {l.lastAccessedAt && (
                  <span className="ml-2 text-xs text-slate-400 dark:text-slate-500">
                    · last viewed {new Date(l.lastAccessedAt).toLocaleDateString()}
                  </span>
                )}
              </div>
              {l.status === "active" && (
                <button
                  type="button"
                  onClick={() => revoke(l.id)}
                  className="rounded border border-slate-300 dark:border-slate-700 px-2 py-0.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-red-50 dark:hover:bg-red-950 hover:text-red-700 dark:hover:text-red-300"
                >
                  Revoke
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const QP_LABELS: Record<string, string> = {
  natural_person_5m: "Natural person with ≥$5M in investments",
  family_company_5m: "Family-owned company with ≥$5M in investments",
  trust_qp_settlors: "Trust whose trustees and settlors are all qualified purchasers",
  institutional_25m: "Person investing ≥$25M on a discretionary basis",
  qualified_institutional_buyer: "Qualified institutional buyer (Rule 144A)",
  knowledgeable_employee: "Knowledgeable employee of the fund (Rule 3c-5)",
};

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</dt>
      <dd className="text-sm text-slate-800 dark:text-slate-200">{value}</dd>
    </div>
  );
}

export function InvestorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [investor, setInvestor] = useState<InvestorDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api
      .get<InvestorDetail>(`/investors/${id}`)
      .then(setInvestor)
      .catch((err) => setError(err.message));
  }, [id]);

  if (error) return <p className="text-sm text-red-600 dark:text-red-300">{error}</p>;
  if (!investor) return <p className="text-slate-500 dark:text-slate-400">Loading…</p>;

  const isOrg = investor.type === "entity" || investor.type === "trust";
  const basisLabel = ACCREDITATION_BASES.find((b) => b.value === investor.accreditationBasis)?.label;
  const displayName = isOrg
    ? investor.entityName ?? "(unnamed)"
    : `${investor.firstName ?? ""} ${investor.lastName ?? ""}`.trim();
  // Same preconditions the API enforces on POST /subscriptions — mirrored here
  // so the button is disabled rather than failing after the fact.
  const readyToSubscribe = Boolean(investor.accreditationBasis && investor.taxProfile);

  return (
    <div>
      <Link to="/investors" className="mb-4 inline-block text-sm text-slate-500 dark:text-slate-400 hover:underline">
        ← Back to investors
      </Link>

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{displayName}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 capitalize">{investor.type}</p>
        </div>
        {readyToSubscribe ? (
          <Link
            to={`/subscriptions/new?investorId=${investor.id}`}
            className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
          >
            Start subscription
          </Link>
        ) : (
          <span
            className="rounded bg-slate-100 dark:bg-slate-800 px-4 py-2 text-sm font-medium text-slate-400 dark:text-slate-500"
            title="Complete accreditation and a tax form before subscribing"
          >
            Start subscription
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 lg:col-span-2">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Profile</h2>
          <dl className="grid grid-cols-2 gap-4">
            {isOrg ? (
              <>
                <Field label="Entity name" value={investor.entityName} />
                <Field label="Entity type" value={investor.entitySubtype} />
              </>
            ) : (
              <>
                <Field label="First name" value={investor.firstName} />
                <Field label="Last name" value={investor.lastName} />
              </>
            )}
            <Field label="Email" value={investor.email} />
            <Field label="Phone" value={investor.phone} />
            <Field
              label="Address"
              value={[investor.addressLine1, investor.city, investor.state, investor.postalCode]
                .filter(Boolean)
                .join(", ") || null}
            />
            <Field label="Country" value={investor.country} />
            <Field label="Tax residency" value={investor.taxResidencyCountry} />
          </dl>

          {(investor.isErisaPlan || investor.isIraAccount || investor.isTaxExempt) && (
            <div className="mt-4 flex flex-wrap gap-2">
              {investor.isErisaPlan && (
                <span className="rounded bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs text-slate-600 dark:text-slate-400">ERISA plan</span>
              )}
              {investor.isIraAccount && (
                <span className="rounded bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs text-slate-600 dark:text-slate-400">IRA account</span>
              )}
              {investor.isTaxExempt && (
                <span className="rounded bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs text-slate-600 dark:text-slate-400">Tax-exempt</span>
              )}
            </div>
          )}

          {investor.principals.length > 0 && (
            <div className="mt-6">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                Principals
              </h3>
              <ul className="space-y-1 text-sm text-slate-700 dark:text-slate-300">
                {investor.principals.map((p) => (
                  <li key={p.id}>
                    {p.firstName} {p.lastName}
                    <span className="ml-2 text-xs text-slate-400 dark:text-slate-500">{p.role.replace(/_/g, " ")}</span>
                    {p.isPrimaryContact && (
                      <span className="ml-2 rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-xs text-slate-500 dark:text-slate-400">
                        primary contact
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Accreditation & Tax
          </h2>
          {investor.accreditationBasis ? (
            <div className="mb-4">
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{basisLabel}</p>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                Attested {investor.accreditationAttestedAt && new Date(investor.accreditationAttestedAt).toLocaleDateString()}
              </p>
            </div>
          ) : (
            <p className="mb-4 text-sm text-amber-600">Not yet set</p>
          )}

          <div className="mb-4">
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
              Qualified purchaser
            </h3>
            {investor.qualifiedPurchaserBasis ? (
              <>
                <p className="text-sm text-slate-800 dark:text-slate-200">
                  {QP_LABELS[investor.qualifiedPurchaserBasis] ?? investor.qualifiedPurchaserBasis}
                </p>
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  Attested{" "}
                  {investor.qpAttestedAt && new Date(investor.qpAttestedAt).toLocaleDateString()}
                </p>
              </>
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Not established — cannot subscribe to 3(c)(7) funds
              </p>
            )}
          </div>

          {investor.evidence.length > 0 && (
            <div className="mb-4">
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                Evidence
              </h3>
              <ul className="text-sm text-slate-600 dark:text-slate-400">
                {investor.evidence.map((e) => (
                  <li key={e.id}>{e.fileName}</li>
                ))}
              </ul>
            </div>
          )}

          {investor.taxProfile ? (
            <div>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                Tax form
              </h3>
              <p className="text-sm text-slate-800 dark:text-slate-200">{investor.taxProfile.formType.toUpperCase()}</p>
            </div>
          ) : (
            <p className="text-sm text-amber-600">Tax form not yet submitted</p>
          )}
        </section>
      </div>

      <section className="mt-6 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Subscription history
        </h2>
        {investor.subscriptions.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-500">No subscriptions yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-400 dark:text-slate-500">
              <tr>
                <th className="py-2">Fund</th>
                <th className="py-2">Status</th>
                <th className="py-2">Amount</th>
                <th className="py-2">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {investor.subscriptions.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-800">
                  <td className="py-2">
                    <Link
                      to={`/subscriptions/${s.id}`}
                      className="font-medium text-slate-900 dark:text-slate-100 hover:underline"
                    >
                      {s.fund.name}
                    </Link>
                  </td>
                  <td className="py-2">
                    <StatusBadge status={s.status} />
                  </td>
                  <td className="py-2 tabular-nums">
                    {s.amount
                      ? Number(s.amount).toLocaleString("en-US", {
                          style: "currency",
                          currency: "USD",
                          maximumFractionDigits: 0,
                        })
                      : "—"}
                  </td>
                  <td className="py-2">{new Date(s.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <AccessLinksPanel investorId={investor.id} />
    </div>
  );
}
