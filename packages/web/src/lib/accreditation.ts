import type { AccreditationBasis, InvestorType } from "./types";

interface BasisMeta {
  value: AccreditationBasis;
  label: string;
  helpText: string;
  appliesTo: InvestorType[];
}

const NATURAL_PERSON: InvestorType[] = ["individual", "joint"];
const ORG: InvestorType[] = ["entity", "trust"];

export const ACCREDITATION_BASES: BasisMeta[] = [
  {
    value: "individual_income",
    label: "Individual income",
    helpText: "Income > $200k (individual) in each of the prior 2 years, with a reasonable expectation of the same this year.",
    appliesTo: NATURAL_PERSON,
  },
  {
    value: "individual_net_worth",
    label: "Individual net worth",
    helpText: "Net worth > $1M, excluding the value of a primary residence.",
    appliesTo: NATURAL_PERSON,
  },
  {
    value: "joint_net_worth_spousal_equivalent",
    label: "Joint net worth (spousal equivalent)",
    helpText: "Joint income > $300k, or joint net worth > $1M with a spouse or spousal equivalent.",
    appliesTo: ["joint"],
  },
  {
    value: "professional_certification",
    label: "Professional certification",
    helpText: "Holder of a Series 7, 65, or 82 license in good standing.",
    appliesTo: NATURAL_PERSON,
  },
  {
    value: "knowledgeable_employee",
    label: "Knowledgeable employee",
    helpText: "Knowledgeable employee of the fund issuing the securities.",
    appliesTo: NATURAL_PERSON,
  },
  {
    value: "entity_owners_all_accredited",
    label: "All equity owners accredited",
    helpText: "Every equity owner of the entity is independently accredited.",
    appliesTo: ORG,
  },
  {
    value: "entity_assets_over_5m",
    label: "Entity/trust assets > $5M",
    helpText: "Not formed for the specific purpose of acquiring the securities offered, with total assets exceeding $5M.",
    appliesTo: ORG,
  },
  { value: "entity_investment_advisor", label: "Registered investment advisor", helpText: "SEC- or state-registered investment advisor.", appliesTo: ORG },
  { value: "entity_broker_dealer", label: "Broker-dealer", helpText: "Registered broker-dealer.", appliesTo: ORG },
  { value: "entity_bank_or_savings_institution", label: "Bank or savings institution", helpText: "Bank, savings and loan association, or similar institution.", appliesTo: ORG },
  { value: "entity_insurance_company", label: "Insurance company", helpText: "Insurance company as defined in the Securities Act.", appliesTo: ORG },
  { value: "entity_registered_investment_company", label: "Registered investment company", helpText: "Investment company registered under the Investment Company Act.", appliesTo: ORG },
  { value: "entity_business_development_company", label: "Business development company", helpText: "BDC as defined in the Investment Company Act.", appliesTo: ORG },
  { value: "entity_small_business_investment_company", label: "Small business investment company", helpText: "Licensed SBIC under the Small Business Investment Act.", appliesTo: ORG },
  {
    value: "entity_erisa_plan",
    label: "ERISA employee benefit plan",
    helpText: "Investment decision made by a bank, insurer, or registered investment advisor, or plan assets exceed $5M.",
    appliesTo: ORG,
  },
  {
    value: "entity_government_plan",
    label: "Government employee benefit plan",
    helpText: "State or federal employee benefit plan with assets exceeding $5M.",
    appliesTo: ORG,
  },
  { value: "entity_family_office", label: "Family office", helpText: "Family office with >$5M AUM, not formed to acquire the specific securities offered.", appliesTo: ORG },
  { value: "entity_family_client", label: "Family client", helpText: "Family client of a qualifying family office.", appliesTo: ORG },
  {
    value: "entity_rural_business_investment_company",
    label: "Rural business investment company",
    helpText: "RBIC as defined under the Consolidated Farm and Rural Development Act.",
    appliesTo: ORG,
  },
];

export function basesForInvestorType(type: InvestorType): BasisMeta[] {
  return ACCREDITATION_BASES.filter((b) => b.appliesTo.includes(type));
}
