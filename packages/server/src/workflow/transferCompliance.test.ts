import { describe, expect, it } from "vitest";
import { checkTransferCompliance } from "./transferCompliance.js";

// transferrable is new: a fund whose LPA prohibits transfer must block the
// request outright, before eligibility or holder-cap even matter. Uses
// transfereeIsExistingHolder: true throughout to avoid the holder-cap branch,
// which hits the register — this file tests the oracle's own decision logic,
// not the database.

const ELIGIBLE_TRANSFEREE = {
  type: "entity" as const,
  accreditationBasis: "entity_assets_over_5m",
  qualifiedPurchaserBasis: "institutional_25m" as const,
};

describe("checkTransferCompliance — fund transferrability", () => {
  it("blocks a transfer when the fund is marked non-transferrable", async () => {
    const result = await checkTransferCompliance(
      {
        transferee: ELIGIBLE_TRANSFEREE,
        fund: { id: "f1", name: "Locked Fund", exclusion: "section_3c7", transferrable: false },
        transfereeIsExistingHolder: true,
      },
      new Date()
    );
    expect(result.allowed).toBe(false);
    expect(result.reasons.map((r) => r.code)).toContain("fund_not_transferrable");
  });

  it("does not block when transferrable is unset — permitted is the default", async () => {
    const result = await checkTransferCompliance(
      {
        transferee: ELIGIBLE_TRANSFEREE,
        fund: { id: "f1", name: "Ordinary Fund", exclusion: "section_3c7" },
        transfereeIsExistingHolder: true,
      },
      new Date()
    );
    expect(result.reasons.map((r) => r.code)).not.toContain("fund_not_transferrable");
  });

  it("still checks transferee eligibility even when the fund is transferrable", async () => {
    const result = await checkTransferCompliance(
      {
        transferee: { type: "entity", accreditationBasis: null, qualifiedPurchaserBasis: null },
        fund: { id: "f1", name: "3(c)(7) Fund", exclusion: "section_3c7", transferrable: true },
        transfereeIsExistingHolder: true,
      },
      new Date()
    );
    expect(result.allowed).toBe(false);
    expect(result.reasons.map((r) => r.code)).toContain("transferee_no_accreditation");
  });
});
