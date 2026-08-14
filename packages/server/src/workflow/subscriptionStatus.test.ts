import { describe, expect, it } from "vitest";
import {
  TRANSITIONS,
  TransitionError,
  allowedNext,
  assertTransition,
  effectiveActor,
} from "./subscriptionStatus.js";

// The state machine encodes two separate guarantees, and the second is the one
// worth testing hardest: an advisor firm must never be able to accept or fund
// its own subscription, and a sponsor must not perform a review an engaged
// fund administrator owns. Both are separation-of-duties properties — the kind
// that look fine in a happy-path demo and matter only when someone tries.

const NO_ADMIN = { status: "pending_fund_admin_review" as const, fundAdminTenantId: null };
const WITH_ADMIN = {
  status: "pending_fund_admin_review" as const,
  fundAdminTenantId: "admin-tenant-id",
};

describe("separation of duties", () => {
  it("never lets an advisor firm accept, reject, or fund", () => {
    for (const to of ["accepted", "rejected", "funded"] as const) {
      const rule = TRANSITIONS.find((t) => t.to === to);
      expect(rule?.actors).not.toContain("advisor_firm");
    }
  });

  it("never lets a sponsor or administrator submit on the investor's behalf", () => {
    const advisorSteps = TRANSITIONS.filter((t) =>
      ["pending_investor_data", "pending_signatures", "pending_gp_countersign"].includes(t.to)
    );
    for (const rule of advisorSteps) {
      expect(rule.actors).toEqual(["advisor_firm"]);
    }
  });

  it("rejects an advisor trying to accept its own subscription", () => {
    expect(() => assertTransition(NO_ADMIN, "accepted", "advisor_firm")).toThrow(TransitionError);
  });
});

describe("fund administrator vs sponsor fallback", () => {
  it("assigns review to the administrator when one is engaged", () => {
    const rule = TRANSITIONS.find(
      (t) => t.from === "pending_fund_admin_review" && t.to === "accepted"
    )!;
    expect(effectiveActor(rule, WITH_ADMIN)).toBe("fund_admin");
  });

  it("falls back to the sponsor when no administrator is engaged", () => {
    const rule = TRANSITIONS.find(
      (t) => t.from === "pending_fund_admin_review" && t.to === "accepted"
    )!;
    expect(effectiveActor(rule, NO_ADMIN)).toBe("sponsor_firm");
  });

  it("locks the sponsor out of review once an administrator is engaged", () => {
    // Exclusivity matters: if both could act, the record would not show who
    // actually owned the review.
    expect(() => assertTransition(WITH_ADMIN, "accepted", "sponsor_firm")).toThrow(
      /fund administrator/
    );
    expect(() => assertTransition(NO_ADMIN, "accepted", "sponsor_firm")).not.toThrow();
  });

  it("locks the administrator out of a subscription it does not administer", () => {
    expect(() => assertTransition(NO_ADMIN, "accepted", "fund_admin")).toThrow(TransitionError);
  });

  it("keeps countersignature with the sponsor regardless of administrator", () => {
    const subject = { status: "pending_gp_countersign" as const, fundAdminTenantId: "admin-id" };
    expect(() =>
      assertTransition(subject, "pending_fund_admin_review", "sponsor_firm")
    ).not.toThrow();
    expect(() =>
      assertTransition(subject, "pending_fund_admin_review", "fund_admin")
    ).toThrow(TransitionError);
  });
});

describe("custodian vs fund administrator vs sponsor, for funding confirmation", () => {
  const fundedRule = () => TRANSITIONS.find((t) => t.from === "accepted" && t.to === "funded")!;

  it("assigns funding confirmation to an attached custodian over an engaged administrator", () => {
    const subject = {
      status: "accepted" as const,
      fundAdminTenantId: "admin-tenant-id",
      custodianTenantId: "custodian-tenant-id",
    };
    expect(effectiveActor(fundedRule(), subject)).toBe("custodian");
  });

  it("falls back to the administrator when no custodian is attached", () => {
    const subject = {
      status: "accepted" as const,
      fundAdminTenantId: "admin-tenant-id",
      custodianTenantId: null,
    };
    expect(effectiveActor(fundedRule(), subject)).toBe("fund_admin");
  });

  it("falls back to the sponsor when neither is engaged", () => {
    const subject = { status: "accepted" as const, fundAdminTenantId: null, custodianTenantId: null };
    expect(effectiveActor(fundedRule(), subject)).toBe("sponsor_firm");
  });

  it("locks the administrator and sponsor out once a custodian is attached", () => {
    const subject = {
      status: "accepted" as const,
      fundAdminTenantId: "admin-tenant-id",
      custodianTenantId: "custodian-tenant-id",
    };
    expect(() => assertTransition(subject, "funded", "fund_admin")).toThrow(/custodian/);
    expect(() => assertTransition(subject, "funded", "sponsor_firm")).toThrow(/custodian/);
    expect(() => assertTransition(subject, "funded", "custodian")).not.toThrow();
  });
});

describe("transition legality", () => {
  it("refuses to skip the signature and countersign steps", () => {
    expect(() =>
      assertTransition({ status: "draft", fundAdminTenantId: null }, "funded", "sponsor_firm")
    ).toThrow(/Cannot move a subscription/);
  });

  it("refuses to move backwards", () => {
    expect(() =>
      assertTransition({ status: "funded", fundAdminTenantId: null }, "accepted", "sponsor_firm")
    ).toThrow(TransitionError);
  });

  it("treats funded and rejected as terminal", () => {
    expect(allowedNext("funded")).toHaveLength(0);
    expect(allowedNext("rejected")).toHaveLength(0);
  });

  it("gives a 403 for a wrong-actor attempt and a 400 for an illegal one", () => {
    // The distinction is meaningful to a caller: one is "not you", the other
    // is "not possible".
    try {
      assertTransition(WITH_ADMIN, "accepted", "sponsor_firm");
      expect.unreachable();
    } catch (e) {
      expect((e as TransitionError).status).toBe(403);
    }
    try {
      assertTransition({ status: "draft", fundAdminTenantId: null }, "funded", "advisor_firm");
      expect.unreachable();
    } catch (e) {
      expect((e as TransitionError).status).toBe(400);
    }
  });

  it("has no unreachable status other than the entry state", () => {
    const reachable = new Set(TRANSITIONS.map((t) => t.to));
    const froms = new Set(TRANSITIONS.map((t) => t.from));
    for (const from of froms) {
      if (from === "draft") continue;
      expect(reachable.has(from)).toBe(true);
    }
  });
});
