import type { DocumentTemplateStatus, TenantType } from "@prisma/client";

// The document-template lifecycle, mirroring subscriptionStatus.ts's shape:
// one table of legal transitions, each naming who may perform it.
//
// Unlike Subscription's fund-admin step, this has no actor-fallback to
// resolve — pending_legal_review is only ever reached when a fund's counsel
// is engaged (Fund.fundLegalTenantId set); a fund with no counsel engaged
// never leaves "processing" through this machine at all; the upload route
// takes it straight to "ready" on the sponsor's own say, no transition
// needed. So every rule below has exactly one actor.

export interface TransitionRule {
  from: DocumentTemplateStatus;
  to: DocumentTemplateStatus;
  actors: TenantType[];
  label: string;
}

export const TRANSITIONS: TransitionRule[] = [
  {
    from: "processing",
    to: "pending_legal_review",
    actors: ["sponsor_firm"],
    label: "Submitted for legal review",
  },
  {
    from: "rejected",
    to: "pending_legal_review",
    actors: ["sponsor_firm"],
    label: "Resubmitted for legal review",
  },
  {
    from: "pending_legal_review",
    to: "ready",
    actors: ["fund_legal"],
    label: "Approved by counsel",
  },
  {
    from: "pending_legal_review",
    to: "rejected",
    actors: ["fund_legal"],
    label: "Rejected by counsel",
  },
  {
    from: "processing",
    to: "archived",
    actors: ["sponsor_firm"],
    label: "Archived before review",
  },
  {
    from: "ready",
    to: "archived",
    actors: ["sponsor_firm"],
    label: "Archived (superseded)",
  },
];

const ACTOR_LABELS: Record<TenantType, string> = {
  advisor_firm: "advisor firm",
  investor_direct: "investor",
  sponsor_firm: "fund sponsor",
  fund_admin: "fund administrator",
  fund_legal: "fund counsel",
  custodian: "custodian",
};

export class TransitionError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function allowedNext(from: DocumentTemplateStatus): DocumentTemplateStatus[] {
  return TRANSITIONS.filter((t) => t.from === from).map((t) => t.to);
}

export function assertTransition(
  from: DocumentTemplateStatus,
  to: DocumentTemplateStatus,
  actor: TenantType
): TransitionRule {
  const rule = TRANSITIONS.find((t) => t.from === from && t.to === to);
  if (!rule) {
    throw new TransitionError(
      `Cannot move a template from "${from}" to "${to}". ` +
        `Valid next states: ${allowedNext(from).join(", ") || "none (terminal)"}.`
    );
  }
  if (!rule.actors.includes(actor)) {
    throw new TransitionError(
      `This transition is performed by the ${rule.actors.map((a) => ACTOR_LABELS[a]).join(" or ")}, not by you.`,
      403
    );
  }
  return rule;
}
