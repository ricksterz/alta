import type { SubscriptionStatus, TenantType } from "@prisma/client";

// The subscription lifecycle, as one table rather than scattered `if
// (status === ...)` checks across routes. Two things are encoded per
// transition: which status it may move to, and which side of the platform is
// allowed to move it. The second matters as much as the first — an advisor
// firm must not be able to mark its own subscription accepted or funded, and
// a sponsor must not be able to submit on the investor's behalf.

export interface TransitionRule {
  from: SubscriptionStatus;
  to: SubscriptionStatus;
  /** Which tenant type may perform this transition. */
  actor: TenantType;
  /** Short description, used in audit metadata and error messages. */
  label: string;
}

export const TRANSITIONS: TransitionRule[] = [
  // --- Advisor side ---
  {
    from: "draft",
    to: "pending_investor_data",
    actor: "advisor_firm",
    label: "Subscription started",
  },
  {
    from: "pending_investor_data",
    to: "pending_signatures",
    actor: "advisor_firm",
    label: "Document generated and sent for signature",
  },
  {
    from: "pending_signatures",
    to: "pending_gp_countersign",
    actor: "advisor_firm",
    label: "Investor signature(s) complete",
  },

  // --- Sponsor / GP side ---
  {
    from: "pending_gp_countersign",
    to: "pending_fund_admin_review",
    actor: "sponsor_firm",
    label: "GP countersigned",
  },
  {
    from: "pending_fund_admin_review",
    to: "accepted",
    actor: "sponsor_firm",
    label: "Accepted by fund admin",
  },
  {
    from: "pending_fund_admin_review",
    to: "rejected",
    actor: "sponsor_firm",
    label: "Rejected by fund admin",
  },
  {
    from: "pending_gp_countersign",
    to: "rejected",
    actor: "sponsor_firm",
    label: "Rejected at countersign",
  },
  {
    from: "accepted",
    to: "funded",
    actor: "sponsor_firm",
    label: "Capital received — funded",
  },
];

export class TransitionError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function assertTransition(
  from: SubscriptionStatus,
  to: SubscriptionStatus,
  actor: TenantType
): TransitionRule {
  const rule = TRANSITIONS.find((t) => t.from === from && t.to === to);
  if (!rule) {
    throw new TransitionError(
      `Cannot move a subscription from "${from}" to "${to}". ` +
        `Valid next states: ${allowedNext(from).join(", ") || "none (terminal)"}.`
    );
  }
  if (rule.actor !== actor) {
    throw new TransitionError(
      `This transition is performed by the ${
        rule.actor === "sponsor_firm" ? "fund sponsor" : "advisor firm"
      }, not by you.`,
      403
    );
  }
  return rule;
}

export function allowedNext(from: SubscriptionStatus): SubscriptionStatus[] {
  return TRANSITIONS.filter((t) => t.from === from).map((t) => t.to);
}

/** Timestamp column to stamp when entering a given status, if any. */
export const STATUS_TIMESTAMP: Partial<Record<SubscriptionStatus, string>> = {
  pending_signatures: "submittedAt",
  pending_gp_countersign: "signedAt",
  pending_fund_admin_review: "countersignedAt",
  accepted: "decidedAt",
  rejected: "decidedAt",
  funded: "fundedAt",
};
