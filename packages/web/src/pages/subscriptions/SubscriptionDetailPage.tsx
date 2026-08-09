import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import { useAuth } from "../../auth/AuthContext";
import { StatusBadge } from "../../components/StatusBadge";
import type { SignatureRequestItem, SubscriptionDetail } from "../../lib/types";

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
    <li className="rounded border border-slate-200 px-3 py-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-slate-800">{signature.signerName}</div>
          <div className="text-xs text-slate-400">
            {roleLabel}
            {signature.signerEmail && ` · ${signature.signerEmail}`}
          </div>
        </div>
        {signature.status === "signed" ? (
          <div className="text-right">
            <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
              Signed
            </span>
            <div className="mt-1 text-xs text-slate-400">
              {signature.typedName} ·{" "}
              {signature.signedAt && new Date(signature.signedAt).toLocaleString()}
            </div>
            {typeof signature.blocksExecuted === "number" && signature.blocksExecuted > 0 && (
              <div className="mt-0.5 text-xs text-slate-400">
                {signature.blocksExecuted} mark{signature.blocksExecuted === 1 ? "" : "s"} executed
              </div>
            )}
          </div>
        ) : canSign ? (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="rounded bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
          >
            Sign
          </button>
        ) : (
          <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
            Pending
          </span>
        )}
      </div>

      {open && signature.status === "pending" && canSign && (
        <div className="mt-3 rounded bg-slate-50 p-3">
          <label className="mb-1 block text-xs font-medium text-slate-600">
            Type full legal name to sign
          </label>
          <div className="flex gap-2">
            <input
              className="flex-1 rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
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
          <p className="mt-2 text-xs text-slate-400">
            Records signer, timestamp, and IP to the audit trail. Dev signature ceremony — not a
            legally binding e-signature.
          </p>
        </div>
      )}
    </li>
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

  if (error && !sub) return <p className="text-sm text-red-600">{error}</p>;
  if (!sub) return <p className="text-slate-500">Loading…</p>;

  const doc = sub.documents[0];
  const unresolved = doc?.unresolvedFields ?? [];

  return (
    <div>
      <Link
        to={isReviewer ? "/subscriptions" : `/investors/${sub.investor.id}`}
        className="mb-4 inline-block text-sm text-slate-500 hover:underline"
      >
        ← Back
      </Link>

      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{sub.investorDisplayName}</h1>
          <p className="text-sm text-slate-500">
            {sub.fund.name}
            {sub.amount && ` · ${Number(sub.amount).toLocaleString("en-US", { style: "currency", currency: "USD" })}`}
            {isReviewer && ` · via ${sub.advisorFirm}`}
          </p>
        </div>
        <StatusBadge status={sub.status} />
      </div>

      {error && <p className="mb-4 rounded bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
      {sub.rejectionReason && (
        <p className="mb-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">
          <span className="font-medium">Rejected:</span> {sub.rejectionReason}
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* --- Document --- */}
        <section className="rounded-lg border border-slate-200 bg-white p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Subscription document
          </h2>

          {!doc ? (
            <>
              <p className="mb-4 text-sm text-slate-500">
                No document generated yet. Generating fills the sponsor's template using this
                investor's profile data.
              </p>
              {!isReviewer && sub.status === "pending_investor_data" && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => act(() => api.post(`/subscriptions/${sub.id}/generate-document`))}
                  className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-40"
                >
                  {busy ? "Generating…" : "Generate document"}
                </button>
              )}
            </>
          ) : (
            <>
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm text-slate-600">
                  Generated {new Date(doc.generatedAt).toLocaleString()}
                </span>
                <a
                  href={`/api/subscriptions/${sub.id}/document`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                >
                  Open PDF
                </a>
              </div>

              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Filled values
              </h3>
              <dl className="mb-4 space-y-1">
                {Object.entries(doc.fieldValues).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4 text-sm">
                    <dt className="text-slate-500">{k}</dt>
                    <dd className="text-right font-medium text-slate-800">{v}</dd>
                  </div>
                ))}
              </dl>

              {unresolved.length > 0 && (
                <div className="rounded bg-amber-50 px-3 py-2">
                  <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-700">
                    {unresolved.length} field(s) left blank
                  </h3>
                  <ul className="space-y-0.5 text-xs text-amber-800">
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
        <section className="rounded-lg border border-slate-200 bg-white p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Signatures
          </h2>

          {sub.signatures.length === 0 ? (
            <p className="text-sm text-slate-400">
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
            <div className="mt-6 border-t border-slate-100 pt-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
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
                {sub.allowedNext.includes("funded") && (
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
                {sub.allowedNext.includes("rejected") && (
                  <button
                    type="button"
                    onClick={() => setShowReject((s) => !s)}
                    className="rounded border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-red-50 hover:text-red-700"
                  >
                    Reject
                  </button>
                )}
              </div>

              {showReject && (
                <div className="mt-3 flex gap-2">
                  <input
                    className="flex-1 rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
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
        </section>
      </div>
    </div>
  );
}
