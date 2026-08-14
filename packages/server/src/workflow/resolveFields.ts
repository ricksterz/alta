import type {
  Fund,
  FundTerms,
  Investor,
  InvestorTaxProfile,
  ShareClass,
  Subscription,
} from "@prisma/client";
import type { CanonicalFieldKey } from "../canonicalFields.js";

// Turns a template's FieldMapping config into the concrete values that go
// into a generated document. This is the heart of Phase 3 and is deliberately
// provider-independent: it produces a plain { anvilFieldKey: value } map that
// either the local pdf-lib provider or Anvil's fillPDF can consume.
//
// Design note on nulls: a canonical field that resolves to null is reported as
// UNRESOLVED rather than silently filled with "". An empty string in an
// executed subscription document is indistinguishable from a deliberate blank,
// and this is exactly the class of error that only surfaces after a GP
// countersigns something incomplete — so callers get the list and decide.

export interface ResolutionSource {
  investor: Investor & { taxProfile: InvestorTaxProfile | null };
  subscription: Subscription;
  fund: Fund & { terms: FundTerms | null };
  /** The subscription's share class, when the fund has more than one. */
  shareClass?: ShareClass | null;
}

export interface FieldMappingInput {
  anvilFieldKey: string;
  mappingType: "canonical" | "static_value" | "unmapped";
  canonicalField: string | null;
  staticValue: string | null;
}

export interface ResolutionResult {
  /** anvilFieldKey → resolved string value, for fields that resolved. */
  values: Record<string, string>;
  /** Fields whose mapping pointed at data that isn't present. */
  unresolved: { anvilFieldKey: string; canonicalField: string; reason: string }[];
  /** Fields the GP never mapped. Not an error here — surfaced for the caller. */
  unmapped: string[];
}

function investorLegalName(investor: Investor): string | null {
  if (investor.type === "entity" || investor.type === "trust") {
    return investor.entityName;
  }
  const full = [investor.firstName, investor.lastName].filter(Boolean).join(" ");
  return full || null;
}

function formatMoney(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  if (Number.isNaN(n)) return null;
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function formatDate(value: Date | null): string | null {
  if (!value) return null;
  return value.toISOString().slice(0, 10);
}

// FundTerms rates are stored as decimals (0.0200 = 2.00%), the same
// convention a cap table or LPA schedule uses internally but not what
// belongs on a document a human reads.
function formatPercent(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  if (Number.isNaN(n)) return null;
  return `${(n * 100).toFixed(2)}%`;
}

const WATERFALL_LABELS: Record<string, string> = {
  european: "European (whole-fund) waterfall",
  american: "American (deal-by-deal) waterfall",
  hybrid: "Hybrid waterfall",
};

// Human-readable rendering of the accreditation enum. The raw enum value
// (entity_assets_over_5m) is a database token, not something that belongs on a
// document a human signs.
const ACCREDITATION_LABELS: Record<string, string> = {
  individual_income: "Individual income test",
  individual_net_worth: "Individual net worth test",
  joint_net_worth_spousal_equivalent: "Joint net worth (spousal equivalent)",
  professional_certification: "Professional certification (Series 7/65/82)",
  director_officer_or_gp_of_issuer: "Director, officer, or general partner of the issuer",
  knowledgeable_employee: "Knowledgeable employee of the fund",
  entity_owners_all_accredited: "Entity — all equity owners accredited",
  entity_assets_over_5m: "Entity/trust with assets over $5M",
  entity_investment_advisor: "Registered investment advisor",
  entity_broker_dealer: "Registered broker-dealer",
  entity_bank_or_savings_institution: "Bank or savings institution",
  entity_insurance_company: "Insurance company",
  entity_registered_investment_company: "Registered investment company",
  entity_business_development_company: "Business development company",
  entity_small_business_investment_company: "Small business investment company",
  entity_erisa_plan: "ERISA employee benefit plan",
  entity_government_plan: "Government employee benefit plan",
  entity_family_office: "Family office",
  entity_family_client: "Family client",
  entity_rural_business_investment_company: "Rural business investment company",
};

type Resolver = (src: ResolutionSource) => string | null;

const RESOLVERS: Record<CanonicalFieldKey, Resolver> = {
  "investor.legal_name": ({ investor }) => investorLegalName(investor),
  "investor.entity_type": ({ investor }) => investor.entitySubtype,
  "investor.tax_id": ({ investor }) =>
    investor.taxProfile?.w9TaxpayerId ?? investor.taxProfile?.w8ForeignTaxId ?? null,
  "investor.address_line1": ({ investor }) => investor.addressLine1,
  "investor.address_line2": ({ investor }) => investor.addressLine2,
  "investor.city": ({ investor }) => investor.city,
  "investor.state": ({ investor }) => investor.state,
  "investor.postal_code": ({ investor }) => investor.postalCode,
  "investor.country": ({ investor }) => investor.country,
  "investor.email": ({ investor }) => investor.email,
  "investor.phone": ({ investor }) => investor.phone,
  "investor.accreditation_basis": ({ investor }) =>
    investor.accreditationBasis ? ACCREDITATION_LABELS[investor.accreditationBasis] ?? null : null,
  "subscription.amount": ({ subscription }) => formatMoney(subscription.amount),
  "subscription.date": ({ subscription }) => formatDate(subscription.createdAt),
  "fund.name": ({ fund }) => fund.name,
  "fund.legal_name": ({ fund }) => fund.legalName ?? fund.name,
  "fund.gp_signatory_name": ({ fund }) => fund.gpSignatoryName,
  // Share-class rate wins when the subscription's class sets one; otherwise
  // fall back to the fund-wide term. A class without its own rate isn't
  // "no fee" — it inherits the fund's, the same way an unset closeDate on a
  // FundClose isn't "no close".
  "fund.management_fee_rate": ({ fund, shareClass }) =>
    formatPercent(shareClass?.managementFeeRate ?? fund.terms?.managementFeeRate),
  "fund.carried_interest_rate": ({ fund, shareClass }) =>
    formatPercent(shareClass?.carriedInterestRate ?? fund.terms?.carriedInterestRate),
  "fund.hurdle_rate": ({ fund }) => formatPercent(fund.terms?.hurdleRate),
  "fund.catch_up_rate": ({ fund }) => formatPercent(fund.terms?.catchUpRate),
  "fund.waterfall_type": ({ fund }) =>
    fund.terms?.waterfallType ? (WATERFALL_LABELS[fund.terms.waterfallType] ?? null) : null,
  "fund.gp_commitment_pct": ({ fund }) => formatPercent(fund.terms?.gpCommitmentPct),
  "fund.term_years": ({ fund }) =>
    fund.terms?.fundTermYears ? `${fund.terms.fundTermYears} years` : null,
  "fund.investment_period_end_date": ({ fund }) => formatDate(fund.terms?.investmentPeriodEndDate ?? null),
};

export function resolveFields(
  mappings: FieldMappingInput[],
  source: ResolutionSource
): ResolutionResult {
  const values: Record<string, string> = {};
  const unresolved: ResolutionResult["unresolved"] = [];
  const unmapped: string[] = [];

  for (const mapping of mappings) {
    if (mapping.mappingType === "unmapped") {
      unmapped.push(mapping.anvilFieldKey);
      continue;
    }

    if (mapping.mappingType === "static_value") {
      if (mapping.staticValue) {
        values[mapping.anvilFieldKey] = mapping.staticValue;
      } else {
        unresolved.push({
          anvilFieldKey: mapping.anvilFieldKey,
          canonicalField: "(static)",
          reason: "Mapping is static_value but no value is set",
        });
      }
      continue;
    }

    const key = mapping.canonicalField as CanonicalFieldKey | null;
    if (!key) {
      unresolved.push({
        anvilFieldKey: mapping.anvilFieldKey,
        canonicalField: "(none)",
        reason: "Mapping is canonical but no canonical field is selected",
      });
      continue;
    }

    const resolver = RESOLVERS[key];
    if (!resolver) {
      // Registry drift: a mapping stored under an older registry version
      // points at a key this build no longer knows. Surface it rather than
      // dropping the field silently.
      unresolved.push({
        anvilFieldKey: mapping.anvilFieldKey,
        canonicalField: key,
        reason: "Unknown canonical field — mapping may predate the current registry",
      });
      continue;
    }

    const value = resolver(source);
    if (value === null || value === undefined || value === "") {
      unresolved.push({
        anvilFieldKey: mapping.anvilFieldKey,
        canonicalField: key,
        reason: "No value on the investor/subscription/fund record",
      });
      continue;
    }
    values[mapping.anvilFieldKey] = value;
  }

  return { values, unresolved, unmapped };
}
