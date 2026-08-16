import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import { useAuth } from "../../auth/AuthContext";
import { StatusBadge } from "../../components/StatusBadge";
import type { SignatureRequestItem, SubscriptionDetail, TenantSummary } from "../../lib/types";

function SignatureRow({
  signature,
  canSign,
  onSign,
}: {
  signature: SignatureRequestItem;
  canSign: boolean;
  onSign: (id: string, typedName: string) => Promise<void>;
}) {
  const [typedName, setTypedName] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const roleLabel = signature.role === "gp_countersigner" ? "GP countersignature" : "Investor signature";

  return (
    <li className="rounded border border-slate-200 dark:border-slate-800 px-3 py-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-slate-800 dark:text-slate-200">{signature.signerName}</div>
          <div className="text-xs text-slate-400 dark:text-slate-500">
            {roleLabel}
            {signature.signerEmail && ` · ${signature.signerEmail}`}
          </div>
        </div>
        {signature.status === "signed" ? (
          <div className="text-right">
            <span className="rounded bg-emerald-50 dark:bg-emerald-950 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
              Signed
            </span>
            <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">
              {signature.typedName} ·{" "}
              {signature.signedAt && new Date(signature.signedAt).toLocaleString()}
            </div>
            {typeof signature.blocksExecuted === "number" && signature.blocksExecuted > 0 && (
              <div className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                {signature.blocksExecuted} mark{signature.blocksExecuted === 1 ? "" : "s"} executed
              </div>
            )}
          </div>
        ) : canSign ? (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="rounded bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
          >
            Sign
          </button>
        ) : (
          <span className="rounded bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs font-medium text-slate-500 dark:text-slate-400">
            Pending
          </span>
        )}
      </div>

      {open && signature.status === "pending" && canSign && (
        <div className="mt-3 rounded bg-slate-50 dark:bg-slate-800 p-3">
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
            Type full legal name to sign
          </label>
          <div className="flex gap-2">
            <input
              className="flex-1 rounded border border-slate-300 dark:border-slate-700 px-2 py-1.5 text-sm focus:border-slate-500 dark:focus:border-slate-400 focus:outline-none"
              placeholder={signature.signerName}
              value={typedName}
              onChange={(e) => setTypedName(e.target.value)}
            />
            <button
              type="button"
              disabled={!typedName.trim() || busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onSign(signature.id, typedName.trim());
                } finally {
                  setBusy(false);
                }
              }}
              className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-40"
            >
              {busy ? "Signing…" : "Apply signature"}
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
            Records signer, timestamp, and IP to the audit trail. Dev signature ceremony — not a
            legally binding e-signature.
          </p>
        </div>
      )}
    </li>
  );
}

// onAttach is the page's act() wrapper — it never rejects, it sets the
// page-level error banner instead, so there's no local error state to catch.
function AttachCustodian({ onAttach }: { onAttach: (custodianTenantId: string) => Promise<void> }) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<TenantSummary[]>([]);

  useEffect(() => {
    if (search.trim().length === 0) {
      setResults([]);
      return;
    }
    const handle = setTimeout(() => {
      api
        .get<TenantSummary[]>(`/subscriptions/custodian-tenants?search=${encodeURIComponent(search)}`)
        .then(setResults)
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(handle);
  }, [search]);

  return (
    <div className="mt-4 border-t border-slate-100 dark:border-slate-800 pt-4">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
        Attach a custodian
      </h3>
      <p className="mb-2 text-xs text-slate-400 dark:text-slate-500">
        Once attached, the custodian confirms funding instead of the fund sponsor or administrator.
      </p>
      <div className="relative">
        <input
          className="w-full rounded border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm focus:border-slate-500 dark:focus:border-slate-400 focus:outline-none"
          placeholder="Search custodians…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {results.length > 0 && (
          <ul className="absolute z-10 mt-1 w-full rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
            {results.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={async () => {
                    await onAttach(t.id);
                    setSearch("");
                    setResults([]);
                  }}
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  {t.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function SubscriptionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [sub, setSub] = useState<SubscriptionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);

  const isSponsor = user?.tenantType === "sponsor_firm";
  const isFundAdmin = user?.tenantType === "fund_admin";
  const isCustodian = user?.tenantType === "custodian";
  const isAdvisor = user?.tenantType === "advisor_firm";
  // Both sponsor and fund admin view a subscription as a reviewer rather than
  // its originator: they see the advisor firm, and they get the decision
  // controls the state machine permits them.
  const isReviewer = isSponsor || isFundAdmin;

  const load = useCallback(() => {
    if (!id) return;
    api
      .get<SubscriptionDetail>(`/subscriptions/${id}`)
      .then(setSub)
      .catch((err) => setError(err.message));
  }, [id]);

  useEffect(load, [load]);

  async function act(fn: () => Promise<unknown>) {
    setError(null);
    setBusy(true);
    try {
      await fn();
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  if (error && !sub) return <p className="text-sm text-red-600 dark:text-red-300">{error}</p>;
  if (!sub) return <p className="text-slate-500 dark:text-slate-400">Loading…</p>;

  const doc = sub.documents[0];
  const unresolved = doc?.unresolvedFields ?? [];
  const custodianParticipant = sub.participants.find((p) => p.role === "custodian");
  const fundAdminParticipant = sub.participants.find((p) => p.role === "fund_admin");
  // Once a custodian is attached it exclusively confirms funding — see
  // subscriptionStatus.ts's effectiveActor — so the sponsor/fund-admin panel
  // hides that action rather than offering a button that would 403.
  const fundingIsSponsorSide = !custodianParticipant;

  return (
    <div>
      <Link
        to={isReviewer ? "/subscriptions" : `/investors/${sub.investor.id}`}
        className="mb-4 inline-block text-sm text-slate-500 dark:text-slate-400 hover:underline"
      >
        ← Back
      </Link>

      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{sub.investorDisplayName}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {sub.fund.name}
            {sub.shareClass && ` (${sub.shareClass.name})`}
            {sub.amount && ` · ${Number(sub.amount).toLocaleString("en-US", { style: "currency", currency: "USD" })}`}
            {isReviewer && ` · via ${sub.advisorFirm}`}
          </p>
          {(sub.shareClass?.managementFeeRate ?? sub.fund.terms?.managementFeeRate) && (
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
              {(Number(sub.shareClass?.managementFeeRate ?? sub.fund.terms?.managementFeeRate) * 100).toFixed(2)}%
              management fee
              {sub.fund.terms?.carriedInterestRate &&
                ` · ${(Number(sub.shareClass?.carriedInterestRate ?? sub.fund.terms.carriedInterestRate) * 100).toFixed(2)}% carry`}
              {sub.fund.terms?.hurdleRate && ` · ${(Number(sub.fund.terms.hurdleRate) * 100).toFixed(2)}% hurdle`}
            </p>
          )}
        </div>
        <StatusBadge status={sub.status} />
      </div>

      {error && <p className="mb-4 rounded bg-red-50 dark:bg-red-950 px-3 py-2 text-sm text-red-600 dark:text-red-300">{error}</p>}
      {sub.rejectionReason && (
        <p className="mb-4 rounded bg-red-50 dark:bg-red-950 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          <span className="font-medium">Rejected:</span> {sub.rejectionReason}
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* --- Document --- */}
        <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Subscription document
          </h2>

          {!doc ? (
            <>
              <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
                No document generated yet. Generating fills the sponsor's template using this
                investor's profile data.
              </p>
              {!isReviewer && sub.status === "pending_investor_data" && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => act(() => api.post(`/subscriptions/${sub.id}/generate-document`))}
                  className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white disabled:opacity-40"
                >
                  {busy ? "Generating…" : "Generate document"}
                </button>
              )}
            </>
          ) : (
            <>
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm text-slate-600 dark:text-slate-400">
                  Generated {new Date(doc.generatedAt).toLocaleString()}
                </span>
                <a
                  href={`/api/subscriptions/${sub.id}/document`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Open PDF
                </a>
              </div>

              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                Filled values
              </h3>
              <dl className="mb-4 space-y-1">
                {Object.entries(doc.fieldValues).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4 text-sm">
                    <dt className="shrink-0 text-slate-500 dark:text-slate-400">{k}</dt>
                    <dd className="break-words text-right font-medium text-slate-800 dark:text-slate-200">{v}</dd>
                  </div>
                ))}
              </dl>

              {unresolved.length > 0 && (
                <div className="rounded bg-amber-50 dark:bg-amber-950 px-3 py-2">
                  <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                    {unresolved.length} field(s) left blank
                  </h3>
                  <ul className="space-y-0.5 text-xs text-amber-800 dark:text-amber-200">
                    {unresolved.map((u) => (
                      <li key={u.anvilFieldKey}>
                        <span className="font-medium">{u.anvilFieldKey}</span> — {u.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </section>

        {/* --- Signatures --- */}
        <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Signatures
          </h2>

          {sub.signatures.length === 0 ? (
            <p className="text-sm text-slate-400 dark:text-slate-500">
              Signature requests are created when the document is generated.
            </p>
          ) : (
            <ul className="space-y-2">
              {sub.signatures.map((s) => {
                // Only the sponsor countersigns; only the advisor captures
                // investor signatures. A fund administrator signs neither.
                const isMySide =
                  s.role === "gp_countersigner" ? isSponsor : !isReviewer;
                const earlierPending = sub.signatures.some(
                  (o) => o.sequence < s.sequence && o.status === "pending"
                );
                return (
                  <SignatureRow
                    key={s.id}
                    signature={s}
                    canSign={isMySide && s.status === "pending" && !earlierPending}
                    onSign={(sigId, typedName) =>
                      act(() =>
                        api.post(`/subscriptions/${sub.id}/signatures/${sigId}/sign`, { typedName })
                      )
                    }
                  />
                );
              })}
            </ul>
          )}

          {/* --- GP decisions --- */}
          {isReviewer && sub.allowedNext.length > 0 && (
            <div className="mt-6 border-t border-slate-100 dark:border-slate-800 pt-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                Fund admin
              </h3>
              <div className="flex flex-wrap gap-2">
                {sub.allowedNext.includes("accepted") && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      act(() => api.post(`/subscriptions/${sub.id}/transition`, { to: "accepted" }))
                    }
                    className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-40"
                  >
                    Accept
                  </button>
                )}
                {sub.allowedNext.includes("funded") && fundingIsSponsorSide && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      act(() => api.post(`/subscriptions/${sub.id}/transition`, { to: "funded" }))
                    }
                    className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-40"
                  >
                    Mark funded
                  </button>
                )}
                {sub.allowedNext.includes("funded") && !fundingIsSponsorSide && (
                  <span
                    className="rounded bg-slate-100 dark:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-400 dark:text-slate-500"
                    title={`Attached custodian ${custodianParticipant?.tenant.name} confirms funding`}
                  >
                    Awaiting custodian
                  </span>
                )}
                {sub.allowedNext.includes("rejected") && (
                  <button
                    type="button"
                    onClick={() => setShowReject((s) => !s)}
                    className="rounded border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-red-50 dark:hover:bg-red-950 hover:text-red-700 dark:hover:text-red-300"
                  >
                    Reject
                  </button>
                )}
              </div>

              {showReject && (
                <div className="mt-3 flex gap-2">
                  <input
                    className="flex-1 rounded border border-slate-300 dark:border-slate-700 px-2 py-1.5 text-sm focus:border-slate-500 dark:focus:border-slate-400 focus:outline-none"
                    placeholder="Reason for rejection"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                  />
                  <button
                    type="button"
                    disabled={!rejectReason.trim() || busy}
                    onClick={() =>
                      act(() =>
                        api.post(`/subscriptions/${sub.id}/transition`, {
                          to: "rejected",
                          rejectionReason: rejectReason.trim(),
                        })
                      )
                    }
                    className="rounded bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-40"
                  >
                    Confirm reject
                  </button>
                </div>
              )}
            </div>
          )}

          {/* --- Custodian's own confirm-funding action --- */}
          {isCustodian && (
            <div className="mt-6 border-t border-slate-100 dark:border-slate-800 pt-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                Custodian
              </h3>
              {sub.allowedNext.includes("funded") ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => act(() => api.post(`/subscriptions/${sub.id}/confirm-funding`))}
                  className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-40"
                >
                  {busy ? "Confirming…" : "Confirm funding received"}
                </button>
              ) : (
                <p className="text-sm text-slate-400 dark:text-slate-500">
                  {sub.status === "funded" ? "Funding already confirmed." : "Not yet ready to fund."}
                </p>
              )}
            </div>
          )}

          {/* --- Participants: fund admin / custodian, and the advisor's attach action --- */}
          {(fundAdminParticipant || custodianParticipant || isAdvisor) && (
            <div className="mt-6 border-t border-slate-100 dark:border-slate-800 pt-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                Other participants
              </h3>
              <ul className="space-y-1 text-sm text-slate-700 dark:text-slate-300">
                {fundAdminParticipant && (
                  <li>
                    {fundAdminParticipant.tenant.name}{" "}
                    <span className="text-xs text-slate-400 dark:text-slate-500">fund administrator</span>
                  </li>
                )}
                {custodianParticipant && (
                  <li>
                    {custodianParticipant.tenant.name}{" "}
                    <span className="text-xs text-slate-400 dark:text-slate-500">custodian</span>
                  </li>
                )}
                {!fundAdminParticipant && !custodianParticipant && (
                  <li className="text-slate-400 dark:text-slate-500">None attached.</li>
                )}
              </ul>
              {isAdvisor && !custodianParticipant && (
                <AttachCustodian
                  onAttach={(custodianTenantId) =>
                    act(() =>
                      api.post(`/subscriptions/${sub.id}/custodian`, { custodianTenantId })
                    )
                  }
                />
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
