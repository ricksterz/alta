import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import type { InvestorType, PrincipalRole, TaxFormType } from "../lib/types";
import { basesForInvestorType } from "../lib/accreditation";

const STEPS = ["Profile", "Accreditation", "Tax status", "Review"] as const;

interface ProfileForm {
  type: InvestorType;
  firstName: string;
  lastName: string;
  entityName: string;
  entitySubtype: string;
  email: string;
  phone: string;
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  jointFirstName: string;
  jointLastName: string;
  jointEmail: string;
  signerFirstName: string;
  signerLastName: string;
  signerEmail: string;
  signerTitle: string;
}

const emptyProfile: ProfileForm = {
  type: "individual",
  firstName: "",
  lastName: "",
  entityName: "",
  entitySubtype: "",
  email: "",
  phone: "",
  addressLine1: "",
  city: "",
  state: "",
  postalCode: "",
  country: "US",
  jointFirstName: "",
  jointLastName: "",
  jointEmail: "",
  signerFirstName: "",
  signerLastName: "",
  signerEmail: "",
  signerTitle: "",
};

function inputClass() {
  return "w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none";
}
function labelClass() {
  return "mb-1 block text-sm font-medium text-slate-700";
}

export function InvestorWizardPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [investorId, setInvestorId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [profile, setProfile] = useState<ProfileForm>(emptyProfile);
  const isOrg = profile.type === "entity" || profile.type === "trust";
  const isJoint = profile.type === "joint";

  const [accreditationBasis, setAccreditationBasis] = useState("");
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const availableBases = useMemo(() => basesForInvestorType(profile.type), [profile.type]);

  const [taxFormType, setTaxFormType] = useState<TaxFormType>("w9");
  const [w9TaxpayerId, setW9TaxpayerId] = useState("");
  const [w8Country, setW8Country] = useState("");
  const [w8ForeignTaxId, setW8ForeignTaxId] = useState("");

  function update<K extends keyof ProfileForm>(key: K, value: ProfileForm[K]) {
    setProfile((p) => ({ ...p, [key]: value }));
  }

  async function submitProfile() {
    setSubmitting(true);
    setError(null);
    try {
      const principals: {
        role: PrincipalRole;
        firstName: string;
        lastName: string;
        email?: string;
        title?: string;
        isPrimaryContact?: boolean;
      }[] = [];

      if (isOrg) {
        principals.push({
          role: profile.type === "trust" ? "trustee" : "entity_signer",
          firstName: profile.signerFirstName,
          lastName: profile.signerLastName,
          email: profile.signerEmail || undefined,
          title: profile.signerTitle || undefined,
          isPrimaryContact: true,
        });
      } else {
        principals.push({
          role: "primary",
          firstName: profile.firstName,
          lastName: profile.lastName,
          email: profile.email || undefined,
          isPrimaryContact: true,
        });
        if (isJoint) {
          principals.push({
            role: "joint_owner",
            firstName: profile.jointFirstName,
            lastName: profile.jointLastName,
            email: profile.jointEmail || undefined,
          });
        }
      }

      const investor = await api.post<{ id: string }>("/investors", {
        type: profile.type,
        firstName: isOrg ? undefined : profile.firstName,
        lastName: isOrg ? undefined : profile.lastName,
        entityName: isOrg ? profile.entityName : undefined,
        entitySubtype: isOrg ? profile.entitySubtype : undefined,
        email: profile.email || undefined,
        phone: profile.phone || undefined,
        addressLine1: profile.addressLine1 || undefined,
        city: profile.city || undefined,
        state: profile.state || undefined,
        postalCode: profile.postalCode || undefined,
        country: profile.country || undefined,
        principals,
      });

      setInvestorId(investor.id);
      setStep(1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save profile");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitAccreditation() {
    if (!investorId) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.patch(`/investors/${investorId}/accreditation`, {
        accreditationBasis,
      });
      if (evidenceFile) {
        const form = new FormData();
        form.append("file", evidenceFile);
        await api.post(`/investors/${investorId}/evidence`, form);
      }
      setStep(2);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save accreditation");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitTaxProfile() {
    if (!investorId) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.patch(`/investors/${investorId}/tax-profile`, {
        formType: taxFormType,
        w9TaxpayerIdType: taxFormType === "w9" ? "ssn_or_ein" : undefined,
        w9TaxpayerId: taxFormType === "w9" ? w9TaxpayerId : undefined,
        w8CountryOfCitizenship: taxFormType === "w8ben" ? w8Country : undefined,
        w8ForeignTaxId: taxFormType === "w8ben" ? w8ForeignTaxId : undefined,
      });
      setStep(3);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save tax profile");
    } finally {
      setSubmitting(false);
    }
  }

  async function finalSubmit() {
    if (!investorId) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.post(`/investors/${investorId}/submit`);
      navigate(`/investors/${investorId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-2xl font-semibold text-slate-900">New investor</h1>

      <ol className="mb-8 flex items-center gap-2 text-xs">
        {STEPS.map((label, i) => (
          <li
            key={label}
            className={`flex items-center gap-2 rounded-full px-3 py-1 ${
              i === step
                ? "bg-slate-900 text-white"
                : i < step
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-slate-100 text-slate-400"
            }`}
          >
            {i + 1}. {label}
          </li>
        ))}
      </ol>

      {error && <p className="mb-4 rounded bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <div className="rounded-lg border border-slate-200 bg-white p-6">
        {step === 0 && (
          <div className="space-y-4">
            <div>
              <label className={labelClass()}>Investor type</label>
              <select
                value={profile.type}
                onChange={(e) => update("type", e.target.value as InvestorType)}
                className={inputClass()}
              >
                <option value="individual">Individual</option>
                <option value="joint">Joint</option>
                <option value="entity">Entity</option>
                <option value="trust">Trust</option>
              </select>
            </div>

            {isOrg ? (
              <>
                <div>
                  <label className={labelClass()}>Entity name</label>
                  <input className={inputClass()} value={profile.entityName} onChange={(e) => update("entityName", e.target.value)} />
                </div>
                <div>
                  <label className={labelClass()}>Entity type</label>
                  <input
                    className={inputClass()}
                    placeholder="LLC, Limited Partnership, Revocable Trust…"
                    value={profile.entitySubtype}
                    onChange={(e) => update("entitySubtype", e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass()}>{profile.type === "trust" ? "Trustee" : "Authorized signer"} first name</label>
                    <input className={inputClass()} value={profile.signerFirstName} onChange={(e) => update("signerFirstName", e.target.value)} />
                  </div>
                  <div>
                    <label className={labelClass()}>Last name</label>
                    <input className={inputClass()} value={profile.signerLastName} onChange={(e) => update("signerLastName", e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass()}>Signer email</label>
                    <input className={inputClass()} value={profile.signerEmail} onChange={(e) => update("signerEmail", e.target.value)} />
                  </div>
                  <div>
                    <label className={labelClass()}>Title</label>
                    <input
                      className={inputClass()}
                      placeholder="Managing Member, Trustee…"
                      value={profile.signerTitle}
                      onChange={(e) => update("signerTitle", e.target.value)}
                    />
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass()}>First name</label>
                    <input className={inputClass()} value={profile.firstName} onChange={(e) => update("firstName", e.target.value)} />
                  </div>
                  <div>
                    <label className={labelClass()}>Last name</label>
                    <input className={inputClass()} value={profile.lastName} onChange={(e) => update("lastName", e.target.value)} />
                  </div>
                </div>
                {isJoint && (
                  <div className="rounded border border-slate-200 p-4">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Joint owner
                    </p>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className={labelClass()}>First name</label>
                        <input className={inputClass()} value={profile.jointFirstName} onChange={(e) => update("jointFirstName", e.target.value)} />
                      </div>
                      <div>
                        <label className={labelClass()}>Last name</label>
                        <input className={inputClass()} value={profile.jointLastName} onChange={(e) => update("jointLastName", e.target.value)} />
                      </div>
                    </div>
                    <div className="mt-4">
                      <label className={labelClass()}>Email</label>
                      <input className={inputClass()} value={profile.jointEmail} onChange={(e) => update("jointEmail", e.target.value)} />
                    </div>
                  </div>
                )}
              </>
            )}

            <div>
              <label className={labelClass()}>Email</label>
              <input className={inputClass()} value={profile.email} onChange={(e) => update("email", e.target.value)} />
            </div>
            <div>
              <label className={labelClass()}>Phone</label>
              <input className={inputClass()} value={profile.phone} onChange={(e) => update("phone", e.target.value)} />
            </div>
            <div>
              <label className={labelClass()}>Address</label>
              <input className={inputClass()} value={profile.addressLine1} onChange={(e) => update("addressLine1", e.target.value)} />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <input className={inputClass()} placeholder="City" value={profile.city} onChange={(e) => update("city", e.target.value)} />
              <input className={inputClass()} placeholder="State" value={profile.state} onChange={(e) => update("state", e.target.value)} />
              <input className={inputClass()} placeholder="Postal code" value={profile.postalCode} onChange={(e) => update("postalCode", e.target.value)} />
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <div>
              <label className={labelClass()}>Accreditation basis (Reg D 501(a))</label>
              <select
                value={accreditationBasis}
                onChange={(e) => setAccreditationBasis(e.target.value)}
                className={inputClass()}
              >
                <option value="">Select a basis…</option>
                {availableBases.map((b) => (
                  <option key={b.value} value={b.value}>
                    {b.label}
                  </option>
                ))}
              </select>
              {accreditationBasis && (
                <p className="mt-2 text-xs text-slate-500">
                  {availableBases.find((b) => b.value === accreditationBasis)?.helpText}
                </p>
              )}
            </div>
            <div>
              <label className={labelClass()}>Supporting evidence (optional in dev)</label>
              <input
                type="file"
                onChange={(e) => setEvidenceFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-slate-600"
              />
              <p className="mt-1 text-xs text-slate-400">
                Saved to local disk for now — no KYC/AML verification in Phase 1.
              </p>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div>
              <label className={labelClass()}>Tax form</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    checked={taxFormType === "w9"}
                    onChange={() => setTaxFormType("w9")}
                  />
                  W-9 (US person)
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    checked={taxFormType === "w8ben"}
                    onChange={() => setTaxFormType("w8ben")}
                  />
                  W-8BEN (foreign person)
                </label>
              </div>
            </div>

            {taxFormType === "w9" ? (
              <div>
                <label className={labelClass()}>Taxpayer ID (SSN or EIN)</label>
                <input className={inputClass()} value={w9TaxpayerId} onChange={(e) => setW9TaxpayerId(e.target.value)} />
              </div>
            ) : (
              <>
                <div>
                  <label className={labelClass()}>Country of citizenship</label>
                  <input className={inputClass()} value={w8Country} onChange={(e) => setW8Country(e.target.value)} />
                </div>
                <div>
                  <label className={labelClass()}>Foreign tax ID (optional)</label>
                  <input className={inputClass()} value={w8ForeignTaxId} onChange={(e) => setW8ForeignTaxId(e.target.value)} />
                </div>
              </>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4 text-sm text-slate-700">
            <p>
              <span className="font-medium">Type:</span> {profile.type}
            </p>
            <p>
              <span className="font-medium">Name:</span>{" "}
              {isOrg ? profile.entityName : `${profile.firstName} ${profile.lastName}`}
            </p>
            <p>
              <span className="font-medium">Accreditation basis:</span>{" "}
              {availableBases.find((b) => b.value === accreditationBasis)?.label ?? "—"}
            </p>
            <p>
              <span className="font-medium">Tax form:</span> {taxFormType.toUpperCase()}
            </p>
            <p className="text-xs text-slate-400">
              Submitting will record this onboarding as complete in the audit trail.
            </p>
          </div>
        )}

        <div className="mt-6 flex justify-between">
          <button
            type="button"
            disabled={step === 0}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-700 disabled:opacity-40"
          >
            Back
          </button>

          {step === 0 && (
            <button
              type="button"
              disabled={submitting}
              onClick={submitProfile}
              className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {submitting ? "Saving…" : "Continue"}
            </button>
          )}
          {step === 1 && (
            <button
              type="button"
              disabled={submitting || !accreditationBasis}
              onClick={submitAccreditation}
              className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {submitting ? "Saving…" : "Continue"}
            </button>
          )}
          {step === 2 && (
            <button
              type="button"
              disabled={submitting}
              onClick={submitTaxProfile}
              className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {submitting ? "Saving…" : "Continue"}
            </button>
          )}
          {step === 3 && (
            <button
              type="button"
              disabled={submitting}
              onClick={finalSubmit}
              className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {submitting ? "Submitting…" : "Submit"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
