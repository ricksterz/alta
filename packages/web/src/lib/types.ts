export type InvestorType = "individual" | "joint" | "entity" | "trust";

export type AccreditationBasis =
  | "individual_income"
  | "individual_net_worth"
  | "joint_net_worth_spousal_equivalent"
  | "professional_certification"
  | "knowledgeable_employee"
  | "entity_owners_all_accredited"
  | "entity_assets_over_5m"
  | "entity_investment_advisor"
  | "entity_broker_dealer"
  | "entity_bank_or_savings_institution"
  | "entity_insurance_company"
  | "entity_registered_investment_company"
  | "entity_business_development_company"
  | "entity_small_business_investment_company"
  | "entity_erisa_plan"
  | "entity_government_plan"
  | "entity_family_office"
  | "entity_family_client"
  | "entity_rural_business_investment_company";

export type TaxFormType = "w9" | "w8ben";

export type PrincipalRole =
  | "primary"
  | "joint_owner"
  | "trustee"
  | "authorized_signer"
  | "entity_signer";

export type SubscriptionStatus =
  | "draft"
  | "pending_investor_data"
  | "pending_signatures"
  | "pending_gp_countersign"
  | "pending_fund_admin_review"
  | "accepted"
  | "rejected"
  | "funded";

export interface AdvisorRepSummary {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: "advisor_rep" | "advisor_admin";
  tenantId: string;
}

export interface InvestorListItem {
  id: string;
  type: InvestorType;
  displayName: string;
  accreditationBasis: AccreditationBasis | null;
  createdAt: string;
  subscriptionCount: number;
  subscriptionStatusCounts: Partial<Record<SubscriptionStatus, number>>;
}

export interface InvestorPrincipal {
  id: string;
  role: PrincipalRole;
  firstName: string;
  lastName: string;
  email: string | null;
  title: string | null;
  isPrimaryContact: boolean;
}

export interface InvestorTaxProfile {
  formType: TaxFormType;
  w9TaxpayerIdType: string | null;
  w9TaxpayerId: string | null;
  w9ExemptPayeeCode: string | null;
  w9BackupWithholding: boolean | null;
  w8CountryOfCitizenship: string | null;
  w8ForeignTaxId: string | null;
  w8TreatyCountry: string | null;
  w8PermanentResidenceAddr: string | null;
  certifiedAt: string | null;
}

export interface AccreditationEvidence {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface Subscription {
  id: string;
  status: SubscriptionStatus;
  amount: string | null;
  createdAt: string;
  fund: { id: string; name: string };
}

export interface InvestorDetail {
  id: string;
  type: InvestorType;
  firstName: string | null;
  lastName: string | null;
  entityName: string | null;
  entitySubtype: string | null;
  email: string | null;
  phone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  accreditationBasis: AccreditationBasis | null;
  accreditationAttestedAt: string | null;
  createdAt: string;
  principals: InvestorPrincipal[];
  taxProfile: InvestorTaxProfile | null;
  evidence: AccreditationEvidence[];
  subscriptions: Subscription[];
}
