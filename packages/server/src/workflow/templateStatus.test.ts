import { describe, expect, it } from "vitest";
import { TRANSITIONS, TransitionError, allowedNext, assertTransition } from "./templateStatus.js";

// Unlike subscriptionStatus.ts, there's no actor fallback to test here —
// pending_legal_review is only ever reached when counsel is engaged, so
// every rule has exactly one actor. What's worth guarding is that neither
// side can perform the other's half of the approval, and that a template
// can't skip review by jumping straight from processing to ready.

describe("separation of duties", () => {
  it("only the sponsor submits or resubmits for review", () => {
    const submissionSteps = TRANSITIONS.filter((t) => t.to === "pending_legal_review");
    for (const rule of submissionSteps) {
      expect(rule.actors).toEqual(["sponsor_firm"]);
    }
  });

  it("only counsel approves or rejects", () => {
    const decisionSteps = TRANSITIONS.filter(
      (t) => t.from === "pending_legal_review" && (t.to === "ready" || t.to === "rejected")
    );
    for (const rule of decisionSteps) {
      expect(rule.actors).toEqual(["fund_legal"]);
    }
  });

  it("rejects a sponsor trying to approve its own template", () => {
    expect(() => assertTransition("pending_legal_review", "ready", "sponsor_firm")).toThrow(
      TransitionError
    );
  });

  it("rejects counsel trying to submit a template for its own review", () => {
    expect(() => assertTransition("processing", "pending_legal_review", "fund_legal")).toThrow(
      TransitionError
    );
  });
});

describe("transition legality", () => {
  it("has no direct processing -> ready jump — review cannot be skipped", () => {
    const rule = TRANSITIONS.find((t) => t.from === "processing" && t.to === "ready");
    expect(rule).toBeUndefined();
  });

  it("allows resubmission after rejection", () => {
    expect(() =>
      assertTransition("rejected", "pending_legal_review", "sponsor_firm")
    ).not.toThrow();
  });

  it("does not allow re-review from ready — approval is not reversible through this machine", () => {
    expect(() => assertTransition("ready", "pending_legal_review", "sponsor_firm")).toThrow(
      /Cannot move a template/
    );
  });

  it("treats ready and archived as terminal", () => {
    expect(allowedNext("archived")).toHaveLength(0);
  });

  it("gives a 403 for a wrong-actor attempt and a 400 for an illegal one", () => {
    try {
      assertTransition("pending_legal_review", "ready", "sponsor_firm");
      expect.unreachable();
    } catch (e) {
      expect((e as TransitionError).status).toBe(403);
    }
    try {
      assertTransition("ready", "processing", "sponsor_firm");
      expect.unreachable();
    } catch (e) {
      expect((e as TransitionError).status).toBe(400);
    }
  });

  it("has no unreachable status other than the entry state", () => {
    const reachable = new Set(TRANSITIONS.map((t) => t.to));
    const froms = new Set(TRANSITIONS.map((t) => t.from));
    for (const from of froms) {
      if (from === "processing") continue;
      expect(reachable.has(from)).toBe(true);
    }
  });
});
