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

export type TenantType =
  | "advisor_firm"
  | "sponsor_firm"
  | "fund_admin"
  | "fund_legal"
  | "custodian"
  | "investor_direct";

export interface AdvisorRepSummary {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role:
    | "advisor_rep"
    | "advisor_admin"
    | "gp_ops"
    | "fund_admin_ops"
    | "legal_ops"
    | "custodian_ops"
    | "investor_principal";
  tenantId: string;
  tenantType: TenantType;
}

// --- Phase 2: GP/sponsor fund & document-template management ---

export type FundVehicleType = "lp" | "llc_feeder" | "interval_fund" | "non_traded_bdc" | "evergreen";
export type FundStructure = "drawdown" | "continuous";
export type FundStatus = "draft" | "active" | "closed";
export type EntitlementStatus = "active" | "revoked";
export type FundAssetClass =
  | "private_equity"
  | "venture_capital"
  | "private_credit"
  | "real_estate"
  | "infrastructure"
  | "hedge_fund"
  | "fund_of_funds";
export type FundStrategyType =
  | "buyout"
  | "growth_equity"
  | "venture"
  | "credit"
  | "real_estate"
  | "infrastructure"
  | "secondaries"
  | "fund_of_funds"
  | "other";
export type ManagementFeeBasis = "commitments" | "invested_capital" | "nav";
export type WaterfallType = "european" | "american" | "hybrid";
export type DocumentTemplateStatus =
  | "processing"
  | "pending_legal_review"
  | "ready"
  | "rejected"
  | "archived";
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
  vintageYear: number | null;
  assetClass: FundAssetClass | null;
  strategy: FundStrategyType | null;
  activeEntitlementCount: number;
  totalEntitlementCount: number;
}

export interface FundTerms {
  id: string;
  managementFeeRate: string | null;
  managementFeeBasis: ManagementFeeBasis | null;
  carriedInterestRate: string | null;
  hurdleRate: string | null;
  catchUpRate: string | null;
  waterfallType: WaterfallType | null;
  gpCommitmentPct: string | null;
  fundTermYears: number | null;
  extensionYears: number | null;
  investmentPeriodEndDate: string | null;
  recyclingPermitted: boolean | null;
  clawbackProvision: boolean | null;
  sourceDocument: string | null;
  asOfDate: string | null;
  isEstimate: boolean;
}

export interface ShareClassItem {
  id: string;
  name: string;
  currency: string;
  minInvestment: string | null;
  managementFeeRate: string | null;
  carriedInterestRate: string | null;
  closedToNewInvestors: boolean;
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
  vintageYear: number | null;
  fundFamily: string | null;
  fundNumber: string | null;
  assetClass: FundAssetClass | null;
  strategy: FundStrategyType | null;
  baseCurrency: string;
  lei: string | null;
  targetSize: string | null;
  hardCap: string | null;
  erisaEligible: boolean;
  iraEligible: boolean;
  nonUsInvestorsPermitted: boolean;
  taxExemptEligible: boolean;
  transferrable: boolean;
  gpConsentRequired: boolean;
  rofrApplies: boolean;
  lockupMonths: number | null;
  terms: FundTerms | null;
  shareClasses: ShareClassItem[];
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
  legalRejectionReason: string | null;
  legalReviewedAt: string | null;
  fieldMappings: FieldMapping[];
}

// --- Phase 8: fund_legal review queue ---

export interface LegalQueueItem {
  id: string;
  originalFilename: string;
  uploadedAt: string;
  fund: { id: string; name: string; sponsorName: string };
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
  type: TenantType;
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
  qualifiedPurchaserBasis: QualifiedPurchaserBasis | null;
  qpAttestedAt: string | null;
  isErisaPlan: boolean;
  isIraAccount: boolean;
  isTaxExempt: boolean;
  taxResidencyCountry: string | null;
  createdAt: string;
  principals: InvestorPrincipal[];
  taxProfile: InvestorTaxProfile | null;
  evidence: AccreditationEvidence[];
  subscriptions: Subscription[];
}

// --- Phase 3/4: subscription document workflow ---

export type SignerRole = "investor_signer" | "gp_countersigner";
export type SignatureStatus = "pending" | "signed" | "declined";

export interface AvailableFund {
  id: string;
  name: string;
  legalName: string | null;
  vehicleType: FundVehicleType;
  structure: FundStructure;
  minInvestment: string | null;
  closeDate: string | null;
  exclusion: FundExclusion | null;
  domicile: string | null;
  vintageYear: number | null;
  assetClass: FundAssetClass | null;
  strategy: FundStrategyType | null;
  managementFeeRate: string | null;
  carriedInterestRate: string | null;
  hurdleRate: string | null;
  shareClasses: ShareClassItem[];
  hasTemplate: boolean;
  templateUnmappedFieldCount: number;
}

export interface SubscriptionListItem {
  id: string;
  status: SubscriptionStatus;
  amount: string | null;
  createdAt: string;
  investor: { id: string; displayName: string };
  fund: { id: string; name: string };
  advisorFirm: string;
  allowedNext: SubscriptionStatus[];
}

export interface SignatureRequestItem {
  id: string;
  role: SignerRole;
  sequence: number;
  signerName: string;
  signerEmail: string | null;
  status: SignatureStatus;
  signedAt: string | null;
  typedName: string | null;
  /** Count of template signature/initial/date marks this signer executed. */
  blocksExecuted?: number;
}

export interface SubscriptionDocumentItem {
  id: string;
  provider: "local" | "anvil";
  generatedAt: string;
  fieldValues: Record<string, string>;
  unresolvedFields: { anvilFieldKey: string; canonicalField: string; reason: string }[];
}

export interface SubscriptionParticipantItem {
  role: TenantType;
  tenant: { id: string; name: string; type: TenantType };
}

export interface SubscriptionDetail {
  id: string;
  status: SubscriptionStatus;
  amount: string | null;
  createdAt: string;
  rejectionReason: string | null;
  investorDisplayName: string;
  advisorFirm: string;
  investor: { id: string };
  fund: { id: string; name: string; legalName: string | null; terms: FundTerms | null };
  shareClass: ShareClassItem | null;
  documents: SubscriptionDocumentItem[];
  signatures: SignatureRequestItem[];
  participants: SubscriptionParticipantItem[];
  allowedNext: SubscriptionStatus[];
}

// --- Phase 8: custodian attach + funding confirmation ---

export interface TenantSummary {
  id: string;
  name: string;
  slug: string;
}

// --- Qualified purchaser eligibility (ICA §2(a)(51)) ---

export type FundExclusion = "section_3c1" | "section_3c7";

export type QualifiedPurchaserBasis =
  | "natural_person_5m"
  | "family_company_5m"
  | "trust_qp_settlors"
  | "institutional_25m"
  | "qualified_institutional_buyer"
  | "knowledgeable_employee";

export interface QpBasisOption {
  key: QualifiedPurchaserBasis;
  label: string;
  appliesTo: InvestorType[];
}

export interface EligibilityResult {
  eligible: boolean;
  blockers: { code: string; message: string }[];
  warnings: { code: string; message: string }[];
}

// --- Phase 5/6: fund admin, closes, signature blocks, positions, tokenization ---

export type FundCloseStatus = "open" | "closed" | "cancelled";
export type SignatureBlockType = "signature" | "initials" | "date";
export type PositionStatus = "active" | "partially_transferred" | "transferred" | "redeemed";
export type TokenizationStatus = "none" | "pending" | "minted" | "frozen";

export interface FundCloseItem {
  id: string;
  name: string;
  closeDate: string;
  status: FundCloseStatus;
  targetAmount: string | null;
  subscriptionCount: number;
}

export interface PositionListItem {
  id: string;
  investor: { id: string; displayName: string };
  fund: { id: string; name: string; exclusion: FundExclusion | null };
  commitmentAmount: string;
  fundedAmount: string;
  status: PositionStatus;
  tokenization: TokenizationStatus;
  chain: string | null;
  tokenStandard: string | null;
  contractAddress: string | null;
  tokenId: string | null;
  holderWalletAddress: string | null;
  createdAt: string;
}

export interface HolderCapacity {
  currentHolders: number;
  cap: number | null;
  remaining: number | null;
  atCapacity: boolean;
}

// --- Phase 8: LP view-only access links ---

export type AccessLinkStatus = "active" | "expired" | "revoked";

export interface AccessLinkItem {
  id: string;
  expiresAt: string;
  revokedAt: string | null;
  lastAccessedAt: string | null;
  createdAt: string;
  createdBy: string;
  status: AccessLinkStatus;
}

export interface CreatedAccessLink {
  id: string;
  token: string;
  expiresAt: string;
}

export interface LpSubscriptionItem {
  id: string;
  status: SubscriptionStatus;
  amount: string | null;
  fundName: string;
  createdAt: string;
}

export interface LpPositionItem {
  id: string;
  fundName: string;
  commitmentAmount: string;
  fundedAmount: string;
  status: PositionStatus;
}

export interface LpView {
  investor: { displayName: string; type: InvestorType };
  subscriptions: LpSubscriptionItem[];
  positions: LpPositionItem[];
}
