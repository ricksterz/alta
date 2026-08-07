export type InvestorType = "individual" | "joint" | "entity" | "trust";

export type AccreditationBasis =
  | "individual_income"
  | "individual_net_worth"
  | "joint_net_worth_spousal_equivalent"
  | "professional_certification"
  | "director_officer_or_gp_of_issuer"
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

export type TenantType = "advisor_firm" | "sponsor_firm";

export interface AdvisorRepSummary {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: "advisor_rep" | "advisor_admin" | "gp_ops";
  tenantId: string;
  tenantType: TenantType;
}

// --- Phase 2: GP/sponsor fund & document-template management ---

export type FundVehicleType = "lp" | "llc_feeder" | "interval_fund" | "non_traded_bdc" | "evergreen";
export type FundStructure = "drawdown" | "continuous";
export type FundStatus = "draft" | "active" | "closed";
export type EntitlementStatus = "active" | "revoked";
export type DocumentTemplateStatus = "processing" | "ready" | "archived";
export type FieldMappingType = "canonical" | "static_value" | "unmapped";

export interface FundListItem {
  id: string;
  name: string;
  vehicleType: FundVehicleType;
  structure: FundStructure;
  status: FundStatus;
  minInvestment: string | null;
  closeDate: string | null;
  createdAt: string;
  activeEntitlementCount: number;
  totalEntitlementCount: number;
}

export interface FundAdvisorEntitlement {
  id: string;
  status: EntitlementStatus;
  createdAt: string;
  advisorTenant: { id: string; name: string };
}

export interface DocumentTemplateListItem {
  id: string;
  originalFilename: string;
  status: DocumentTemplateStatus;
  uploadedAt: string;
  totalFieldCount: number;
  unmappedFieldCount: number;
}

export interface FundDetail {
  id: string;
  name: string;
  legalName: string | null;
  vehicleType: FundVehicleType;
  structure: FundStructure;
  minInvestment: string | null;
  closeDate: string | null;
  status: FundStatus;
  gpSignatoryName: string | null;
  createdAt: string;
  documentTemplates: DocumentTemplateListItem[];
  advisorEntitlements: FundAdvisorEntitlement[];
}

export interface FieldMapping {
  id: string;
  anvilFieldKey: string;
  anvilFieldLabel: string | null;
  mappingType: FieldMappingType;
  canonicalField: string | null;
  staticValue: string | null;
}

export interface DocumentTemplateDetail {
  id: string;
  fundId: string;
  originalFilename: string;
  status: DocumentTemplateStatus;
  uploadedAt: string;
  fieldMappings: FieldMapping[];
}

export interface CanonicalField {
  key: string;
  label: string;
  sourceModel: string;
  sourceField?: string;
}

export interface AdvisorTenantSummary {
  id: string;
  name: string;
  slug: string;
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
