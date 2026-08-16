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
  /**
   * Which tenant type may perform this transition. Fund-admin-review steps
   * list BOTH fund_admin and sponsor_firm: the administrator performs them
   * when the fund has engaged one, the sponsor otherwise. assertTransition
   * resolves which, given the specific subscription.
   */
  actors: TenantType[];
  /** Short description, used in audit metadata and error messages. */
  label: string;
}

/** Just enough of a subscription to resolve who may act on it. */
export interface TransitionSubject {
  status: SubscriptionStatus;
  /** Null when no fund administrator is engaged for this fund. */
  fundAdminTenantId?: string | null;
  /** Null when no custodian has been attached to this subscription. */
  custodianTenantId?: string | null;
}

export const TRANSITIONS: TransitionRule[] = [
  // --- Advisor side (an advisor firm acting for a client, or a direct
  // investor acting for themselves — see requireAdvisorTenant) ---
  {
    from: "draft",
    to: "pending_investor_data",
    actors: ["advisor_firm", "investor_direct"],
    label: "Subscription started",
  },
  {
    from: "pending_investor_data",
    to: "pending_signatures",
    actors: ["advisor_firm", "investor_direct"],
    label: "Document generated and sent for signature",
  },
  {
    from: "pending_signatures",
    to: "pending_gp_countersign",
    actors: ["advisor_firm", "investor_direct"],
    label: "Investor signature(s) complete",
  },

  // --- Sponsor / GP side ---
  {
    from: "pending_gp_countersign",
    to: "pending_fund_admin_review",
    actors: ["sponsor_firm"],
    label: "GP countersigned",
  },
  {
    from: "pending_fund_admin_review",
    to: "accepted",
    actors: ["fund_admin", "sponsor_firm"],
    label: "Accepted by fund admin",
  },
  {
    from: "pending_fund_admin_review",
    to: "rejected",
    actors: ["fund_admin", "sponsor_firm"],
    label: "Rejected by fund admin",
  },
  {
    from: "pending_gp_countersign",
    to: "rejected",
    actors: ["sponsor_firm"],
    label: "Rejected at countersign",
  },
  {
    from: "accepted",
    to: "funded",
    // Whichever party actually watches capital land takes this exclusively:
    // an attached custodian outranks the fund admin, who outranks the
    // sponsor's own say — see effectiveActor. Custodian involvement is
    // per-subscription (an advisor attaches one, or doesn't), unlike
    // fund_admin which follows from the fund.
    actors: ["custodian", "fund_admin", "sponsor_firm"],
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

const ACTOR_LABELS: Record<TenantType, string> = {
  advisor_firm: "advisor firm",
  investor_direct: "investor",
  sponsor_firm: "fund sponsor",
  fund_admin: "fund administrator",
  fund_legal: "fund counsel",
  custodian: "custodian",
};

/**
 * Resolves which single tenant type may perform a transition on THIS
 * subscription. Multi-actor rules come in two different flavors:
 *
 *  - Optional-party rules (fund_admin/custodian alongside sponsor_firm):
 *    whichever party is actually engaged on THIS subscription takes
 *    exclusive responsibility, resolved from subscription state — a
 *    sponsor_firm caller must still be rejected when a fund admin is
 *    engaged, regardless of who's asking.
 *  - Equivalent-role rules (advisor_firm / investor_direct): both are
 *    unconditionally valid, and scopedClient already confines the caller to
 *    its own subscription, so there's no ambiguity to resolve from state —
 *    the effective actor is simply whichever listed type the caller is.
 */
export function effectiveActor(
  rule: TransitionRule,
  subject: TransitionSubject,
  actor?: TenantType
): TenantType {
  if (rule.actors.length === 1) return rule.actors[0];
  if (rule.actors.includes("custodian") || rule.actors.includes("fund_admin")) {
    if (rule.actors.includes("custodian") && subject.custodianTenantId) return "custodian";
    if (rule.actors.includes("fund_admin") && subject.fundAdminTenantId) return "fund_admin";
    return "sponsor_firm";
  }
  if (actor && rule.actors.includes(actor)) return actor;
  return rule.actors[0];
}

export function assertTransition(
  subject: TransitionSubject,
  to: SubscriptionStatus,
  actor: TenantType
): TransitionRule {
  const from = subject.status;
  const rule = TRANSITIONS.find((t) => t.from === from && t.to === to);
  if (!rule) {
    throw new TransitionError(
      `Cannot move a subscription from "${from}" to "${to}". ` +
        `Valid next states: ${allowedNext(from).join(", ") || "none (terminal)"}.`
    );
  }
  const required = effectiveActor(rule, subject, actor);
  if (required !== actor) {
    throw new TransitionError(
      `This transition is performed by the ${ACTOR_LABELS[required]}, not by you.`,
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
