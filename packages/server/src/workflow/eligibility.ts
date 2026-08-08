import type {
  FundExclusion,
  InvestorType,
  QualifiedPurchaserBasis,
} from "@prisma/client";

// The one place that decides whether an investor may subscribe to a fund.
//
// Two independent regimes, commonly conflated, which is the bug this module
// exists to prevent:
//
//   Reg D 501(a) "accredited investor"  — ~$1M net worth or $200k income.
//     Gates a 3(c)(1) fund.
//   ICA §2(a)(51) "qualified purchaser" — ~$5M in INVESTMENTS (a different
//     measure from net worth, and a much higher bar). Gates a 3(c)(7) fund.
//
// Accreditation does NOT imply QP status. Most private funds rely on 3(c)(7),
// so treating "accredited" as sufficient everywhere would let a merely-
// accredited investor into funds they are not eligible for.
//
// Everything here evaluates SELF-ATTESTED data. Alta performs no independent
// verification of net worth, investments, or QP status — see the disclosures
// in the web app footer. This is an eligibility gate, not a diligence process.

export interface EligibilityInput {
  investor: {
    type: InvestorType;
    accreditationBasis: string | null;
    qualifiedPurchaserBasis: QualifiedPurchaserBasis | null;
  };
  fund: {
    exclusion: FundExclusion | null;
    name: string;
  };
}

export interface EligibilityResult {
  eligible: boolean;
  /** Machine-readable blockers, for the API. */
  blockers: { code: string; message: string }[];
  /** Non-blocking things a rep should still see. */
  warnings: { code: string; message: string }[];
}

// Which QP bases can legitimately apply to which investor types. A natural
// person can't qualify as a "family company", and an LLC can't qualify under
// the natural-person test — accepting either would record an attestation that
// is facially wrong.
const QP_BASIS_APPLIES_TO: Record<QualifiedPurchaserBasis, InvestorType[]> = {
  natural_person_5m: ["individual", "joint"],
  family_company_5m: ["entity", "trust"],
  trust_qp_settlors: ["trust"],
  institutional_25m: ["entity", "trust"],
  qualified_institutional_buyer: ["entity"],
  knowledgeable_employee: ["individual", "joint"],
};

export const QP_BASIS_LABELS: Record<QualifiedPurchaserBasis, string> = {
  natural_person_5m: "Natural person with ≥$5M in investments",
  family_company_5m: "Family-owned company with ≥$5M in investments",
  trust_qp_settlors: "Trust whose trustees and settlors are all qualified purchasers",
  institutional_25m: "Person investing ≥$25M on a discretionary basis",
  qualified_institutional_buyer: "Qualified institutional buyer (Rule 144A)",
  knowledgeable_employee: "Knowledgeable employee of the fund (Rule 3c-5)",
};

export function qpBasesForInvestorType(type: InvestorType): QualifiedPurchaserBasis[] {
  return (Object.keys(QP_BASIS_APPLIES_TO) as QualifiedPurchaserBasis[]).filter((b) =>
    QP_BASIS_APPLIES_TO[b].includes(type)
  );
}

export function checkEligibility({ investor, fund }: EligibilityInput): EligibilityResult {
  const blockers: EligibilityResult["blockers"] = [];
  const warnings: EligibilityResult["warnings"] = [];

  // Accreditation is the floor for any private-fund subscription.
  if (!investor.accreditationBasis) {
    blockers.push({
      code: "no_accreditation",
      message: "Investor has not established an accredited investor basis.",
    });
  }

  if (fund.exclusion === "section_3c7") {
    if (!investor.qualifiedPurchaserBasis) {
      blockers.push({
        code: "qp_required",
        message:
          `${fund.name} relies on the 3(c)(7) exclusion, which is limited to qualified ` +
          `purchasers (ICA §2(a)(51), broadly ≥$5M in investments). This investor has no ` +
          `qualified purchaser basis on file. Accredited investor status is not sufficient.`,
      });
    } else if (
      !QP_BASIS_APPLIES_TO[investor.qualifiedPurchaserBasis].includes(investor.type)
    ) {
      blockers.push({
        code: "qp_basis_mismatch",
        message:
          `The recorded qualified purchaser basis ` +
          `("${QP_BASIS_LABELS[investor.qualifiedPurchaserBasis]}") does not apply to a ` +
          `${investor.type} investor.`,
      });
    }
  }

  if (fund.exclusion === "section_3c1") {
    // The 100-beneficial-owner cap is a fund-level constraint we can't evaluate
    // from Alta's data — the count spans every subscription across every
    // advisor firm, and Alta only sees its own tenants'. Surfaced so a rep
    // knows to confirm with the GP rather than silently assuming headroom.
    warnings.push({
      code: "3c1_holder_cap",
      message:
        `${fund.name} relies on the 3(c)(1) exclusion, which is capped at 100 beneficial ` +
        `owners. Alta cannot verify remaining capacity — confirm with the fund sponsor.`,
    });
  }

  if (fund.exclusion === null) {
    warnings.push({
      code: "unknown_exclusion",
      message:
        `No Investment Company Act exclusion is recorded for ${fund.name}, so the ` +
        `qualified purchaser requirement could not be evaluated.`,
    });
  }

  return { eligible: blockers.length === 0, blockers, warnings };
}
