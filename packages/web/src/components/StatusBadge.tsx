import type { SubscriptionStatus } from "../lib/types";

// One place for status presentation. The colour encodes *who is blocked*, not
// just sequence: amber = waiting on someone to act, blue = in review, green =
// done, red = stopped. A GP scanning a queue cares about that first.
const STATUS_META: Record<SubscriptionStatus, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-slate-100 text-slate-600" },
  pending_investor_data: { label: "Awaiting investor data", className: "bg-amber-50 text-amber-700" },
  pending_signatures: { label: "Awaiting signatures", className: "bg-amber-50 text-amber-700" },
  pending_gp_countersign: { label: "Awaiting GP countersign", className: "bg-amber-50 text-amber-700" },
  pending_fund_admin_review: { label: "In fund admin review", className: "bg-sky-50 text-sky-700" },
  accepted: { label: "Accepted", className: "bg-emerald-50 text-emerald-700" },
  rejected: { label: "Rejected", className: "bg-red-50 text-red-700" },
  funded: { label: "Funded", className: "bg-emerald-600 text-white" },
};

export function StatusBadge({ status }: { status: SubscriptionStatus }) {
  const meta = STATUS_META[status];
  return (
    <span className={`inline-block whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium ${meta.className}`}>
      {meta.label}
    </span>
  );
}

export function statusLabel(status: SubscriptionStatus) {
  return STATUS_META[status].label;
}
