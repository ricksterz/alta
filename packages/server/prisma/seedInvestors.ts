// Hypothetical investors for the demo environment.
//
// Entirely synthetic — no real people, and the taxpayer identifiers are
// obviously-fake sequences that still exercise the encryption path.
//
// The point of the spread is to make every eligibility branch reachable from
// the UI rather than only from tests:
//   - accredited-but-not-QP investors, so a 3(c)(7) fund visibly refuses them
//   - an ERISA plan, an IRA, and tax-exempt entities, for the Tier 1 gates
//   - a non-US tax resident, for the W-8BEN path and the non-US fund gate
//   - all four InvestorType values, since principals differ by type
//
// Fixed UUIDs keep re-seeding idempotent.

import type {
  AccreditationBasis,
  InvestorType,
  PrincipalRole,
  QualifiedPurchaserBasis,
  TaxFormType,
} from "@prisma/client";

export interface SeedPrincipal {
  role: PrincipalRole;
  firstName: string;
  lastName: string;
  email?: string;
  title?: string;
  isPrimaryContact?: boolean;
}

export interface SeedInvestor {
  id: string;
  type: InvestorType;
  firstName?: string;
  lastName?: string;
  entityName?: string;
  entitySubtype?: string;
  formationJurisdiction?: string;
  email: string;
  phone?: string;
  addressLine1?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  accreditationBasis: AccreditationBasis;
  qualifiedPurchaserBasis: QualifiedPurchaserBasis | null;
  isErisaPlan?: boolean;
  isIraAccount?: boolean;
  isTaxExempt?: boolean;
  taxResidencyCountry?: string;
  taxForm: {
    formType: TaxFormType;
    /** Fake, but shaped like the real thing so masking/encryption is exercised. */
    w9TaxpayerId?: string;
    w9TaxpayerIdType?: string;
    w8CountryOfCitizenship?: string;
    w8ForeignTaxId?: string;
  };
  principals: SeedPrincipal[];
  /** Fund names to subscribe to, with the stage each subscription sits at. */
  subscriptions?: {
    fundName: string;
    amount: number;
    status: "pending_investor_data" | "accepted" | "funded" | "rejected";
    rejectionReason?: string;
  }[];
}

// Funds Harborview is entitled to. 3(c)(1) funds are the only ones a
// non-qualified-purchaser may subscribe to — assignments below respect that,
// so the seeded data doesn't contradict workflow/eligibility.ts.
const FUND_3C1 = "Meridian Growth Fund III";
const FUND_GS_DRAWDOWN = "Exchange Place Master LP";
const FUND_GS_VINTAGE = "Vintage IX B LP";
const FUND_ARES_EVERGREEN = "Ares Capital Europe V (E) Levered";
const FUND_ARES_CREDIT = "Ares Senior Credit Master Fund III LP";

export const SEED_INVESTORS: SeedInvestor[] = [
  {
    id: "11111111-0000-4000-8000-000000000001",
    type: "individual",
    firstName: "Elena",
    lastName: "Vasquez",
    email: "elena.vasquez@example.test",
    phone: "+1 415 555 0142",
    addressLine1: "1820 Fillmore Street",
    city: "San Francisco",
    state: "CA",
    postalCode: "94115",
    country: "US",
    accreditationBasis: "individual_income",
    qualifiedPurchaserBasis: "natural_person_5m",
    taxResidencyCountry: "US",
    taxForm: { formType: "w9", w9TaxpayerIdType: "ssn", w9TaxpayerId: "000-00-0001" },
    principals: [
      { role: "primary", firstName: "Elena", lastName: "Vasquez", email: "elena.vasquez@example.test", isPrimaryContact: true },
    ],
    subscriptions: [
      { fundName: FUND_ARES_EVERGREEN, amount: 2_000_000, status: "funded" },
      { fundName: FUND_GS_DRAWDOWN, amount: 1_500_000, status: "pending_investor_data" },
    ],
  },
  {
    // Accredited but NOT a qualified purchaser — the case that makes the
    // 3(c)(7) gate visible in the UI.
    id: "11111111-0000-4000-8000-000000000002",
    type: "individual",
    firstName: "Marcus",
    lastName: "Hale",
    email: "marcus.hale@example.test",
    addressLine1: "44 Beacon Street",
    city: "Boston",
    state: "MA",
    postalCode: "02108",
    country: "US",
    accreditationBasis: "individual_net_worth",
    qualifiedPurchaserBasis: null,
    taxResidencyCountry: "US",
    taxForm: { formType: "w9", w9TaxpayerIdType: "ssn", w9TaxpayerId: "000-00-0002" },
    principals: [
      { role: "primary", firstName: "Marcus", lastName: "Hale", email: "marcus.hale@example.test", isPrimaryContact: true },
    ],
    subscriptions: [{ fundName: FUND_3C1, amount: 300_000, status: "pending_investor_data" }],
  },
  {
    id: "11111111-0000-4000-8000-000000000003",
    type: "joint",
    firstName: "Priya",
    lastName: "Raman",
    email: "priya.raman@example.test",
    addressLine1: "77 Lakeshore Drive",
    city: "Chicago",
    state: "IL",
    postalCode: "60611",
    country: "US",
    accreditationBasis: "joint_net_worth_spousal_equivalent",
    qualifiedPurchaserBasis: "natural_person_5m",
    taxResidencyCountry: "US",
    taxForm: { formType: "w9", w9TaxpayerIdType: "ssn", w9TaxpayerId: "000-00-0003" },
    principals: [
      { role: "primary", firstName: "Priya", lastName: "Raman", email: "priya.raman@example.test", isPrimaryContact: true },
      { role: "joint_owner", firstName: "Dev", lastName: "Raman", email: "dev.raman@example.test" },
    ],
    subscriptions: [{ fundName: FUND_GS_VINTAGE, amount: 3_000_000, status: "funded" }],
  },
  {
    id: "11111111-0000-4000-8000-000000000004",
    type: "entity",
    entityName: "Meridian Capital Partners LLC",
    entitySubtype: "LLC",
    formationJurisdiction: "Delaware",
    email: "ops@meridiancp.example.test",
    addressLine1: "600 Madison Avenue",
    city: "New York",
    state: "NY",
    postalCode: "10022",
    country: "US",
    accreditationBasis: "entity_assets_over_5m",
    qualifiedPurchaserBasis: "institutional_25m",
    taxResidencyCountry: "US",
    taxForm: { formType: "w9", w9TaxpayerIdType: "ein", w9TaxpayerId: "00-0000004" },
    principals: [
      { role: "entity_signer", firstName: "Dana", lastName: "Whitfield", email: "dana@meridiancp.example.test", title: "Managing Member", isPrimaryContact: true },
    ],
    subscriptions: [
      { fundName: FUND_ARES_CREDIT, amount: 5_000_000, status: "funded" },
      { fundName: FUND_GS_DRAWDOWN, amount: 4_000_000, status: "accepted" },
    ],
  },
  {
    // ERISA plan — exercises Fund.erisaEligible.
    id: "11111111-0000-4000-8000-000000000005",
    type: "entity",
    entityName: "Cascade Ironworkers Pension Trust",
    entitySubtype: "Employee Benefit Plan",
    formationJurisdiction: "Washington",
    email: "trustees@cascadeiron.example.test",
    addressLine1: "1200 Fifth Avenue",
    city: "Seattle",
    state: "WA",
    postalCode: "98101",
    country: "US",
    accreditationBasis: "entity_erisa_plan",
    qualifiedPurchaserBasis: "institutional_25m",
    isErisaPlan: true,
    isTaxExempt: true,
    taxResidencyCountry: "US",
    taxForm: { formType: "w9", w9TaxpayerIdType: "ein", w9TaxpayerId: "00-0000005" },
    principals: [
      { role: "entity_signer", firstName: "Robert", lastName: "Ngo", email: "rngo@cascadeiron.example.test", title: "Trustee", isPrimaryContact: true },
    ],
    subscriptions: [{ fundName: FUND_ARES_CREDIT, amount: 10_000_000, status: "pending_investor_data" }],
  },
  {
    id: "11111111-0000-4000-8000-000000000006",
    type: "trust",
    entityName: "The Whitfield Family Revocable Trust",
    entitySubtype: "Revocable Trust",
    formationJurisdiction: "Nevada",
    email: "trustee@whitfieldtrust.example.test",
    addressLine1: "2400 Rancho Drive",
    city: "Las Vegas",
    state: "NV",
    postalCode: "89102",
    country: "US",
    accreditationBasis: "entity_assets_over_5m",
    qualifiedPurchaserBasis: "trust_qp_settlors",
    taxResidencyCountry: "US",
    taxForm: { formType: "w9", w9TaxpayerIdType: "ein", w9TaxpayerId: "00-0000006" },
    principals: [
      { role: "trustee", firstName: "Alice", lastName: "Whitfield", email: "alice@whitfieldtrust.example.test", title: "Trustee", isPrimaryContact: true },
      { role: "trustee", firstName: "Gordon", lastName: "Whitfield", email: "gordon@whitfieldtrust.example.test", title: "Co-Trustee" },
    ],
    subscriptions: [{ fundName: FUND_ARES_EVERGREEN, amount: 2_500_000, status: "pending_investor_data" }],
  },
  {
    id: "11111111-0000-4000-8000-000000000007",
    type: "entity",
    entityName: "Halvorsen Family Office LP",
    entitySubtype: "Limited Partnership",
    formationJurisdiction: "Delaware",
    email: "investments@halvorsenfo.example.test",
    addressLine1: "1 Greenwich Plaza",
    city: "Greenwich",
    state: "CT",
    postalCode: "06830",
    country: "US",
    accreditationBasis: "entity_family_office",
    qualifiedPurchaserBasis: "family_company_5m",
    taxResidencyCountry: "US",
    taxForm: { formType: "w9", w9TaxpayerIdType: "ein", w9TaxpayerId: "00-0000007" },
    principals: [
      { role: "entity_signer", firstName: "Ingrid", lastName: "Halvorsen", email: "ingrid@halvorsenfo.example.test", title: "Chief Investment Officer", isPrimaryContact: true },
    ],
    subscriptions: [
      { fundName: FUND_GS_VINTAGE, amount: 6_000_000, status: "accepted" },
      { fundName: FUND_ARES_EVERGREEN, amount: 1_000_000, status: "pending_investor_data" },
    ],
  },
  {
    // Non-US tax resident — W-8BEN branch and Fund.nonUsInvestorsPermitted.
    id: "11111111-0000-4000-8000-000000000008",
    type: "individual",
    firstName: "Sofia",
    lastName: "Lindqvist",
    email: "sofia.lindqvist@example.test",
    addressLine1: "Strandvägen 7",
    city: "Stockholm",
    postalCode: "114 56",
    country: "SE",
    accreditationBasis: "professional_certification",
    qualifiedPurchaserBasis: "natural_person_5m",
    taxResidencyCountry: "SE",
    taxForm: { formType: "w8ben", w8CountryOfCitizenship: "Sweden", w8ForeignTaxId: "SE-0000008" },
    principals: [
      { role: "primary", firstName: "Sofia", lastName: "Lindqvist", email: "sofia.lindqvist@example.test", isPrimaryContact: true },
    ],
    subscriptions: [{ fundName: FUND_ARES_EVERGREEN, amount: 1_200_000, status: "pending_investor_data" }],
  },
  {
    // Self-directed IRA — exercises Fund.iraEligible.
    id: "11111111-0000-4000-8000-000000000009",
    type: "individual",
    firstName: "Terrence",
    lastName: "Bell",
    email: "terrence.bell@example.test",
    addressLine1: "900 Congress Avenue",
    city: "Austin",
    state: "TX",
    postalCode: "78701",
    country: "US",
    accreditationBasis: "individual_net_worth",
    qualifiedPurchaserBasis: "natural_person_5m",
    isIraAccount: true,
    taxResidencyCountry: "US",
    taxForm: { formType: "w9", w9TaxpayerIdType: "ssn", w9TaxpayerId: "000-00-0009" },
    principals: [
      { role: "primary", firstName: "Terrence", lastName: "Bell", email: "terrence.bell@example.test", isPrimaryContact: true },
    ],
    subscriptions: [
      { fundName: FUND_3C1, amount: 500_000, status: "rejected", rejectionReason: "Subscription agreement was incomplete — investor questionnaire section 4 unsigned." },
    ],
  },
  {
    id: "11111111-0000-4000-8000-00000000000a",
    type: "entity",
    entityName: "Pinehurst College Endowment",
    entitySubtype: "Nonprofit Corporation",
    formationJurisdiction: "North Carolina",
    email: "cio@pinehurstendowment.example.test",
    addressLine1: "5 Carolina Vista Drive",
    city: "Pinehurst",
    state: "NC",
    postalCode: "28374",
    country: "US",
    accreditationBasis: "entity_assets_over_5m",
    qualifiedPurchaserBasis: "institutional_25m",
    isTaxExempt: true,
    taxResidencyCountry: "US",
    taxForm: { formType: "w9", w9TaxpayerIdType: "ein", w9TaxpayerId: "00-000000A" },
    principals: [
      { role: "entity_signer", firstName: "Yuki", lastName: "Tanaka", email: "ytanaka@pinehurstendowment.example.test", title: "Chief Investment Officer", isPrimaryContact: true },
    ],
    subscriptions: [{ fundName: FUND_ARES_CREDIT, amount: 8_000_000, status: "funded" }],
  },
  {
    id: "11111111-0000-4000-8000-00000000000b",
    type: "individual",
    firstName: "Jordan",
    lastName: "Reyes",
    email: "jordan.reyes@example.test",
    addressLine1: "1500 Market Street",
    city: "Philadelphia",
    state: "PA",
    postalCode: "19102",
    country: "US",
    accreditationBasis: "knowledgeable_employee",
    qualifiedPurchaserBasis: "knowledgeable_employee",
    taxResidencyCountry: "US",
    taxForm: { formType: "w9", w9TaxpayerIdType: "ssn", w9TaxpayerId: "000-00-000B" },
    principals: [
      { role: "primary", firstName: "Jordan", lastName: "Reyes", email: "jordan.reyes@example.test", isPrimaryContact: true },
    ],
    subscriptions: [{ fundName: FUND_ARES_EVERGREEN, amount: 750_000, status: "pending_investor_data" }],
  },
  {
    id: "11111111-0000-4000-8000-00000000000c",
    type: "entity",
    entityName: "Rowan Ridge Advisors LLC",
    entitySubtype: "Registered Investment Adviser",
    formationJurisdiction: "Delaware",
    email: "ops@rowanridge.example.test",
    addressLine1: "222 Berkeley Street",
    city: "Boston",
    state: "MA",
    postalCode: "02116",
    country: "US",
    accreditationBasis: "entity_investment_advisor",
    qualifiedPurchaserBasis: "institutional_25m",
    taxResidencyCountry: "US",
    taxForm: { formType: "w9", w9TaxpayerIdType: "ein", w9TaxpayerId: "00-000000C" },
    principals: [
      { role: "entity_signer", firstName: "Camille", lastName: "Okonkwo", email: "camille@rowanridge.example.test", title: "Managing Partner", isPrimaryContact: true },
    ],
    subscriptions: [{ fundName: FUND_GS_DRAWDOWN, amount: 2_500_000, status: "pending_investor_data" }],
  },
];
