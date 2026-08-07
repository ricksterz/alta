import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";
import type { InvestorDetail } from "../lib/types";
import { ACCREDITATION_BASES } from "../lib/accreditation";

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="text-sm text-slate-800">{value}</dd>
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

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!investor) return <p className="text-slate-500">Loading…</p>;

  const isOrg = investor.type === "entity" || investor.type === "trust";
  const basisLabel = ACCREDITATION_BASES.find((b) => b.value === investor.accreditationBasis)?.label;
  const displayName = isOrg
    ? investor.entityName ?? "(unnamed)"
    : `${investor.firstName ?? ""} ${investor.lastName ?? ""}`.trim();

  return (
    <div>
      <Link to="/investors" className="mb-4 inline-block text-sm text-slate-500 hover:underline">
        ← Back to investors
      </Link>

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{displayName}</h1>
          <p className="text-sm text-slate-500 capitalize">{investor.type}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="rounded-lg border border-slate-200 bg-white p-6 lg:col-span-2">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">Profile</h2>
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
          </dl>

          {investor.principals.length > 0 && (
            <div className="mt-6">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Principals
              </h3>
              <ul className="space-y-1 text-sm text-slate-700">
                {investor.principals.map((p) => (
                  <li key={p.id}>
                    {p.firstName} {p.lastName}
                    <span className="ml-2 text-xs text-slate-400">{p.role.replace(/_/g, " ")}</span>
                    {p.isPrimaryContact && (
                      <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">
                        primary contact
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Accreditation & Tax
          </h2>
          {investor.accreditationBasis ? (
            <div className="mb-4">
              <p className="text-sm font-medium text-slate-800">{basisLabel}</p>
              <p className="text-xs text-slate-400">
                Attested {investor.accreditationAttestedAt && new Date(investor.accreditationAttestedAt).toLocaleDateString()}
              </p>
            </div>
          ) : (
            <p className="mb-4 text-sm text-amber-600">Not yet set</p>
          )}

          {investor.evidence.length > 0 && (
            <div className="mb-4">
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Evidence
              </h3>
              <ul className="text-sm text-slate-600">
                {investor.evidence.map((e) => (
                  <li key={e.id}>{e.fileName}</li>
                ))}
              </ul>
            </div>
          )}

          {investor.taxProfile ? (
            <div>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Tax form
              </h3>
              <p className="text-sm text-slate-800">{investor.taxProfile.formType.toUpperCase()}</p>
            </div>
          ) : (
            <p className="text-sm text-amber-600">Tax form not yet submitted</p>
          )}
        </section>
      </div>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Subscription history
        </h2>
        {investor.subscriptions.length === 0 ? (
          <p className="text-sm text-slate-400">No subscriptions yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-400">
              <tr>
                <th className="py-2">Fund</th>
                <th className="py-2">Status</th>
                <th className="py-2">Amount</th>
                <th className="py-2">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {investor.subscriptions.map((s) => (
                <tr key={s.id}>
                  <td className="py-2">{s.fund.name}</td>
                  <td className="py-2 capitalize">{s.status.replace(/_/g, " ")}</td>
                  <td className="py-2">{s.amount ?? "—"}</td>
                  <td className="py-2">{new Date(s.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
