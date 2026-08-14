import { describe, expect, it } from "vitest";
import { checkEligibility, qpBasesForInvestorType } from "./eligibility.js";

// These tests exist because getting this wrong is a securities-law problem,
// not a UX one. The specific failure they guard against: treating accredited
// investor status as sufficient for a 3(c)(7) fund. Most private funds rely on
// 3(c)(7), so a regression here would let ineligible investors into nearly
// every fund on the platform, and it would do so silently.

const ACCREDITED_ENTITY = {
  type: "entity" as const,
  accreditationBasis: "entity_assets_over_5m",
  qualifiedPurchaserBasis: null,
};

const QP_ENTITY = {
  ...ACCREDITED_ENTITY,
  qualifiedPurchaserBasis: "institutional_25m" as const,
};

const FUND_3C7 = { exclusion: "section_3c7" as const, name: "Test 3(c)(7) Fund" };
const FUND_3C1 = { exclusion: "section_3c1" as const, name: "Test 3(c)(1) Fund" };

describe("checkEligibility — the accredited/QP distinction", () => {
  it("blocks an accredited-but-not-QP investor from a 3(c)(7) fund", () => {
    const result = checkEligibility({ investor: ACCREDITED_ENTITY, fund: FUND_3C7 });
    expect(result.eligible).toBe(false);
    expect(result.blockers.map((b) => b.code)).toContain("qp_required");
  });

  it("admits the same investor to a 3(c)(1) fund", () => {
    const result = checkEligibility({ investor: ACCREDITED_ENTITY, fund: FUND_3C1 });
    expect(result.eligible).toBe(true);
  });

  it("admits a qualified purchaser to a 3(c)(7) fund", () => {
    const result = checkEligibility({ investor: QP_ENTITY, fund: FUND_3C7 });
    expect(result.eligible).toBe(true);
    expect(result.blockers).toHaveLength(0);
  });

  it("blocks anyone with no accreditation basis at all, whatever the exclusion", () => {
    for (const fund of [FUND_3C1, FUND_3C7]) {
      const result = checkEligibility({
        investor: { type: "individual", accreditationBasis: null, qualifiedPurchaserBasis: null },
        fund,
      });
      expect(result.eligible).toBe(false);
      expect(result.blockers.map((b) => b.code)).toContain("no_accreditation");
    }
  });

  it("does not let QP status substitute for missing accreditation", () => {
    const result = checkEligibility({
      investor: {
        type: "entity",
        accreditationBasis: null,
        qualifiedPurchaserBasis: "institutional_25m",
      },
      fund: FUND_3C7,
    });
    expect(result.eligible).toBe(false);
    expect(result.blockers.map((b) => b.code)).toContain("no_accreditation");
  });
});

describe("checkEligibility — QP basis must suit the investor type", () => {
  it("rejects a natural-person basis recorded against an entity", () => {
    const result = checkEligibility({
      investor: {
        type: "entity",
        accreditationBasis: "entity_assets_over_5m",
        qualifiedPurchaserBasis: "natural_person_5m",
      },
      fund: FUND_3C7,
    });
    expect(result.eligible).toBe(false);
    expect(result.blockers.map((b) => b.code)).toContain("qp_basis_mismatch");
  });

  it("rejects an entity basis recorded against a natural person", () => {
    const result = checkEligibility({
      investor: {
        type: "individual",
        accreditationBasis: "individual_net_worth",
        qualifiedPurchaserBasis: "qualified_institutional_buyer",
      },
      fund: FUND_3C7,
    });
    expect(result.eligible).toBe(false);
    expect(result.blockers.map((b) => b.code)).toContain("qp_basis_mismatch");
  });

  it("offers only type-appropriate bases", () => {
    expect(qpBasesForInvestorType("individual")).toEqual(
      expect.arrayContaining(["natural_person_5m", "knowledgeable_employee"])
    );
    expect(qpBasesForInvestorType("individual")).not.toContain("family_company_5m");
    expect(qpBasesForInvestorType("trust")).toContain("trust_qp_settlors");
    expect(qpBasesForInvestorType("individual")).not.toContain("trust_qp_settlors");
  });

  it("every offered basis actually passes for that type", () => {
    // Guards the two lists drifting apart: an option the wizard shows must not
    // then be rejected by the engine.
    for (const type of ["individual", "joint", "entity", "trust"] as const) {
      for (const basis of qpBasesForInvestorType(type)) {
        const result = checkEligibility({
          investor: { type, accreditationBasis: "individual_net_worth", qualifiedPurchaserBasis: basis },
          fund: FUND_3C7,
        });
        expect(result.blockers.map((b) => b.code)).not.toContain("qp_basis_mismatch");
      }
    }
  });
});

describe("checkEligibility — 3(c)(1) holder cap", () => {
  it("warns rather than blocks when capacity is unknown", () => {
    const result = checkEligibility({ investor: ACCREDITED_ENTITY, fund: FUND_3C1 });
    expect(result.eligible).toBe(true);
    expect(result.warnings.map((w) => w.code)).toContain("3c1_holder_cap");
  });

  it("blocks once the register shows the fund at capacity", () => {
    const result = checkEligibility({
      investor: ACCREDITED_ENTITY,
      fund: FUND_3C1,
      holderCapacity: { currentHolders: 100, cap: 100, remaining: 0, atCapacity: true },
    });
    expect(result.eligible).toBe(false);
    expect(result.blockers.map((b) => b.code)).toContain("holder_cap_reached");
  });

  it("reports remaining headroom below the cap without blocking", () => {
    const result = checkEligibility({
      investor: ACCREDITED_ENTITY,
      fund: FUND_3C1,
      holderCapacity: { currentHolders: 61, cap: 100, remaining: 39, atCapacity: false },
    });
    expect(result.eligible).toBe(true);
    expect(result.warnings.find((w) => w.code === "3c1_holder_cap")?.message).toContain("39");
  });

  it("applies no holder cap to a 3(c)(7) fund", () => {
    const result = checkEligibility({
      investor: QP_ENTITY,
      fund: FUND_3C7,
      holderCapacity: { currentHolders: 4000, cap: null, remaining: null, atCapacity: false },
    });
    expect(result.eligible).toBe(true);
  });
});

describe("checkEligibility — eligibility beyond accreditation/QP", () => {
  it("blocks an ERISA plan from a fund that excludes them", () => {
    const result = checkEligibility({
      investor: { ...ACCREDITED_ENTITY, isErisaPlan: true },
      fund: { ...FUND_3C1, erisaEligible: false },
    });
    expect(result.eligible).toBe(false);
    expect(result.blockers.map((b) => b.code)).toContain("erisa_not_permitted");
  });

  it("does not block an ERISA plan when the fund doesn't say erisaEligible: false", () => {
    // Absent/undefined must read as permitted — most funds never set this.
    const result = checkEligibility({
      investor: { ...ACCREDITED_ENTITY, isErisaPlan: true },
      fund: FUND_3C1,
    });
    expect(result.blockers.map((b) => b.code)).not.toContain("erisa_not_permitted");
  });

  it("does not block a non-ERISA investor even when the fund excludes ERISA plans", () => {
    const result = checkEligibility({
      investor: { ...ACCREDITED_ENTITY, isErisaPlan: false },
      fund: { ...FUND_3C1, erisaEligible: false },
    });
    expect(result.blockers.map((b) => b.code)).not.toContain("erisa_not_permitted");
  });

  it("blocks an IRA investment into a fund that excludes IRAs", () => {
    const result = checkEligibility({
      investor: { ...ACCREDITED_ENTITY, isIraAccount: true },
      fund: { ...FUND_3C1, iraEligible: false },
    });
    expect(result.eligible).toBe(false);
    expect(result.blockers.map((b) => b.code)).toContain("ira_not_permitted");
  });

  it("blocks a tax-exempt investor from a fund that excludes them", () => {
    const result = checkEligibility({
      investor: { ...ACCREDITED_ENTITY, isTaxExempt: true },
      fund: { ...FUND_3C1, taxExemptEligible: false },
    });
    expect(result.eligible).toBe(false);
    expect(result.blockers.map((b) => b.code)).toContain("tax_exempt_not_permitted");
  });

  it("blocks a non-US tax resident from a US-only fund", () => {
    const result = checkEligibility({
      investor: { ...ACCREDITED_ENTITY, taxResidencyCountry: "Germany" },
      fund: { ...FUND_3C1, nonUsInvestorsPermitted: false },
    });
    expect(result.eligible).toBe(false);
    expect(result.blockers.map((b) => b.code)).toContain("non_us_not_permitted");
  });

  it("admits a US tax resident to a US-only fund", () => {
    const result = checkEligibility({
      investor: { ...ACCREDITED_ENTITY, taxResidencyCountry: "US" },
      fund: { ...FUND_3C1, nonUsInvestorsPermitted: false },
    });
    expect(result.blockers.map((b) => b.code)).not.toContain("non_us_not_permitted");
  });

  it("does not block on unrecorded tax residency, even for a US-only fund", () => {
    // Unknown must not manufacture a blocker — same principle as unknown_exclusion.
    const result = checkEligibility({
      investor: ACCREDITED_ENTITY,
      fund: { ...FUND_3C1, nonUsInvestorsPermitted: false },
    });
    expect(result.blockers.map((b) => b.code)).not.toContain("non_us_not_permitted");
  });
});

describe("checkEligibility — unknown exclusion", () => {
  it("warns rather than silently passing when no exclusion is recorded", () => {
    const result = checkEligibility({
      investor: ACCREDITED_ENTITY,
      fund: { exclusion: null, name: "Unrecorded Fund" },
    });
    expect(result.warnings.map((w) => w.code)).toContain("unknown_exclusion");
  });

  it("does not demand QP status when the exclusion is unknown", () => {
    // Deliberate: absent data must not manufacture a blocker. The warning is
    // the honest response, not a guess in either direction.
    const result = checkEligibility({
      investor: ACCREDITED_ENTITY,
      fund: { exclusion: null, name: "Unrecorded Fund" },
    });
    expect(result.blockers.map((b) => b.code)).not.toContain("qp_required");
  });
});
