// The fixed, versioned list of fields Alta knows about — what a gp_ops user
// maps Anvil-detected PDF fields onto. Deliberately a TS const array rather
// than a seeded table: it only changes when an engineer adds support for a
// new field, never at runtime by a tenant user, so it needs compile-time +
// zod-boundary validation more than it needs an admin UI or a migration-free
// runtime edit path. Bump CANONICAL_FIELD_REGISTRY_VERSION on any breaking
// change to an existing key (rename/removal) — additions don't need a bump.

export const CANONICAL_FIELD_REGISTRY_VERSION = 1;

export const CANONICAL_FIELDS = [
  { key: "investor.legal_name", label: "Investor legal name", sourceModel: "Investor" },
  { key: "investor.entity_type", label: "Investor entity type (LLC, LP, Trust…)", sourceModel: "Investor", sourceField: "entitySubtype" },
  { key: "investor.tax_id", label: "Investor tax ID (SSN/EIN)", sourceModel: "InvestorTaxProfile" },
  { key: "investor.address_line1", label: "Investor address line 1", sourceModel: "Investor" },
  { key: "investor.address_line2", label: "Investor address line 2", sourceModel: "Investor" },
  { key: "investor.city", label: "Investor city", sourceModel: "Investor" },
  { key: "investor.state", label: "Investor state", sourceModel: "Investor" },
  { key: "investor.postal_code", label: "Investor postal code", sourceModel: "Investor" },
  { key: "investor.country", label: "Investor country", sourceModel: "Investor" },
  { key: "investor.email", label: "Investor email", sourceModel: "Investor" },
  { key: "investor.phone", label: "Investor phone", sourceModel: "Investor" },
  { key: "investor.accreditation_basis", label: "Accreditation basis", sourceModel: "Investor" },
  { key: "subscription.amount", label: "Subscription amount", sourceModel: "Subscription" },
  { key: "subscription.date", label: "Subscription date", sourceModel: "Subscription", sourceField: "createdAt" },
  { key: "fund.name", label: "Fund name", sourceModel: "Fund" },
  { key: "fund.legal_name", label: "Fund legal name", sourceModel: "Fund" },
  { key: "fund.gp_signatory_name", label: "GP signatory name", sourceModel: "Fund" },
] as const;

export type CanonicalFieldKey = (typeof CANONICAL_FIELDS)[number]["key"];

const CANONICAL_FIELD_KEYS = new Set<string>(CANONICAL_FIELDS.map((f) => f.key));

export function isCanonicalFieldKey(key: string): key is CanonicalFieldKey {
  return CANONICAL_FIELD_KEYS.has(key);
}
