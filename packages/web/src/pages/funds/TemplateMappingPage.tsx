import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import { useAuth } from "../../auth/AuthContext";
import type { CanonicalField, DocumentTemplateDetail, FieldMapping, FieldMappingType } from "../../lib/types";

const TEMPLATE_STATUS_META: Record<
  DocumentTemplateDetail["status"],
  { label: string; className: string }
> = {
  processing: { label: "Processing", className: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400" },
  pending_legal_review: { label: "Pending legal review", className: "bg-sky-50 dark:bg-sky-950 text-sky-700 dark:text-sky-300" },
  ready: { label: "Ready", className: "bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300" },
  rejected: { label: "Rejected by counsel", className: "bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300" },
  archived: { label: "Archived", className: "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500" },
};

function ReadOnlyRow({ mapping }: { mapping: FieldMapping }) {
  return (
    <tr className="border-b border-slate-100 dark:border-slate-800">
      <td className="py-3 pr-4">
        <div className="text-sm font-medium text-slate-800 dark:text-slate-200">{mapping.anvilFieldLabel ?? mapping.anvilFieldKey}</div>
        <div className="text-xs text-slate-400 dark:text-slate-500">{mapping.anvilFieldKey}</div>
      </td>
      <td className="py-3 pr-4 text-sm capitalize text-slate-600 dark:text-slate-400">{mapping.mappingType.replace(/_/g, " ")}</td>
      <td className="py-3 text-sm text-slate-600 dark:text-slate-400">
        {mapping.mappingType === "canonical" && (mapping.canonicalField ?? "—")}
        {mapping.mappingType === "static_value" && (mapping.staticValue ?? "—")}
        {mapping.mappingType === "unmapped" && <span className="text-slate-300 dark:text-slate-600">—</span>}
      </td>
    </tr>
  );
}

function RowEditor({
  mapping,
  canonicalFields,
  onSave,
}: {
  mapping: FieldMapping;
  canonicalFields: CanonicalField[];
  onSave: (id: string, patch: { mappingType: FieldMappingType; canonicalField?: string; staticValue?: string }) => Promise<void>;
}) {
  const [mappingType, setMappingType] = useState<FieldMappingType>(mapping.mappingType);
  const [canonicalField, setCanonicalField] = useState(mapping.canonicalField ?? "");
  const [staticValue, setStaticValue] = useState(mapping.staticValue ?? "");
  const [saving, setSaving] = useState(false);

  const dirty =
    mappingType !== mapping.mappingType ||
    canonicalField !== (mapping.canonicalField ?? "") ||
    staticValue !== (mapping.staticValue ?? "");

  async function save() {
    setSaving(true);
    try {
      await onSave(mapping.id, {
        mappingType,
        canonicalField: mappingType === "canonical" ? canonicalField : undefined,
        staticValue: mappingType === "static_value" ? staticValue : undefined,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr className="border-b border-slate-100 dark:border-slate-800">
      <td className="py-3 pr-4">
        <div className="text-sm font-medium text-slate-800 dark:text-slate-200">{mapping.anvilFieldLabel ?? mapping.anvilFieldKey}</div>
        <div className="text-xs text-slate-400 dark:text-slate-500">{mapping.anvilFieldKey}</div>
      </td>
      <td className="py-3 pr-4">
        <select
          className="rounded border border-slate-300 dark:border-slate-700 px-2 py-1.5 text-sm"
          value={mappingType}
          onChange={(e) => setMappingType(e.target.value as FieldMappingType)}
        >
          <option value="unmapped">Unmapped</option>
          <option value="canonical">Canonical field</option>
          <option value="static_value">Static value</option>
        </select>
      </td>
      <td className="py-3 pr-4">
        {mappingType === "canonical" && (
          <select
            className="w-full rounded border border-slate-300 dark:border-slate-700 px-2 py-1.5 text-sm"
            value={canonicalField}
            onChange={(e) => setCanonicalField(e.target.value)}
          >
            <option value="">Select…</option>
            {canonicalFields.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
        )}
        {mappingType === "static_value" && (
          <input
            className="w-full rounded border border-slate-300 dark:border-slate-700 px-2 py-1.5 text-sm"
            placeholder="Constant value for this field"
            value={staticValue}
            onChange={(e) => setStaticValue(e.target.value)}
          />
        )}
        {mappingType === "unmapped" && <span className="text-sm text-slate-300 dark:text-slate-600">—</span>}
      </td>
      <td className="py-3 text-right">
        <button
          type="button"
          disabled={!dirty || saving}
          onClick={save}
          className="rounded border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </td>
    </tr>
  );
}

export function TemplateMappingPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const isFundLegal = user?.tenantType === "fund_legal";
  const isSponsor = user?.tenantType === "sponsor_firm";
  const [template, setTemplate] = useState<DocumentTemplateDetail | null>(null);
  const [canonicalFields, setCanonicalFields] = useState<CanonicalField[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);

  const load = useCallback(() => {
    if (!id) return;
    api
      .get<DocumentTemplateDetail>(`/templates/${id}`)
      .then(setTemplate)
      .catch((err) => setError(err.message));
  }, [id]);

  useEffect(load, [load]);

  useEffect(() => {
    if (isFundLegal) return; // fund_legal never edits mappings
    api
      .get<{ version: number; fields: CanonicalField[] }>("/canonical-fields")
      .then((res) => setCanonicalFields(res.fields))
      .catch(() => setCanonicalFields([]));
  }, [isFundLegal]);

  async function saveMapping(
    mappingId: string,
    patch: { mappingType: FieldMappingType; canonicalField?: string; staticValue?: string }
  ) {
    if (!id) return;
    await api.patch(`/templates/${id}/mappings/${mappingId}`, patch);
    load();
  }

  async function act(fn: () => Promise<unknown>) {
    setError(null);
    setBusy(true);
    try {
      await fn();
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  if (error && !template) return <p className="text-sm text-red-600 dark:text-red-300">{error}</p>;
  if (!template) return <p className="text-slate-500 dark:text-slate-400">Loading…</p>;

  const unmappedCount = template.fieldMappings.filter((m) => m.mappingType === "unmapped").length;
  const statusMeta = TEMPLATE_STATUS_META[template.status];
  const canSubmitForReview =
    isSponsor && (template.status === "processing" || template.status === "rejected") && unmappedCount === 0;
  const canReview = isFundLegal && template.status === "pending_legal_review";

  return (
    <div>
      <Link to={`/funds/${template.fundId}`} className="mb-4 inline-block text-sm text-slate-500 dark:text-slate-400 hover:underline">
        ← Back to fund
      </Link>

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{template.originalFilename}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{template.fieldMappings.length} detected fields</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded px-3 py-1 text-sm font-medium ${statusMeta.className}`}>
            {statusMeta.label}
          </span>
          {!isFundLegal && (
            <span
              className={`rounded px-3 py-1 text-sm font-medium ${
                unmappedCount > 0 ? "bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300" : "bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300"
              }`}
            >
              {unmappedCount > 0 ? `${unmappedCount} unmapped` : "All fields mapped"}
            </span>
          )}
        </div>
      </div>

      {error && <p className="mb-4 rounded bg-red-50 dark:bg-red-950 px-3 py-2 text-sm text-red-600 dark:text-red-300">{error}</p>}

      {template.legalRejectionReason && (
        <p className="mb-4 rounded bg-red-50 dark:bg-red-950 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          <span className="font-medium">Counsel rejected:</span> {template.legalRejectionReason}
        </p>
      )}

      {(canSubmitForReview || canReview) && (
        <div className="mb-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          {canSubmitForReview && (
            <button
              type="button"
              disabled={busy}
              onClick={() => act(() => api.post(`/templates/${id}/submit-for-review`))}
              className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white disabled:opacity-40"
            >
              {template.status === "rejected" ? "Resubmit for legal review" : "Submit for legal review"}
            </button>
          )}
          {canReview && (
            <div className="flex flex-wrap items-start gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  act(() => api.post(`/templates/${id}/legal-review`, { decision: "approve" }))
                }
                className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-40"
              >
                Approve
              </button>
              <button
                type="button"
                onClick={() => setShowReject((s) => !s)}
                className="rounded border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-red-50 dark:hover:bg-red-950 hover:text-red-700 dark:hover:text-red-300"
              >
                Reject
              </button>
              {showReject && (
                <div className="flex w-full gap-2">
                  <input
                    className="flex-1 rounded border border-slate-300 dark:border-slate-700 px-2 py-1.5 text-sm focus:border-slate-500 dark:focus:border-slate-400 focus:outline-none"
                    placeholder="Reason for rejection"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                  />
                  <button
                    type="button"
                    disabled={!rejectReason.trim() || busy}
                    onClick={() =>
                      act(() =>
                        api.post(`/templates/${id}/legal-review`, {
                          decision: "reject",
                          rejectionReason: rejectReason.trim(),
                        })
                      )
                    }
                    className="rounded bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-40"
                  >
                    Confirm reject
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {template.fieldMappings.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 py-16 text-center text-slate-500 dark:text-slate-400">
          No fields were auto-detected for this template. This can happen if Anvil's field-detection
          response came back in an unrecognized shape — check the stored raw response before assuming
          the PDF has no fillable fields.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-400 dark:text-slate-500">
              <tr>
                <th className="pb-2 pr-4">Detected field</th>
                <th className="pb-2 pr-4">Mapping type</th>
                <th className="pb-2 pr-4">Value</th>
                {!isFundLegal && <th className="pb-2"></th>}
              </tr>
            </thead>
            <tbody>
              {isFundLegal
                ? template.fieldMappings.map((m) => <ReadOnlyRow key={m.id} mapping={m} />)
                : template.fieldMappings.map((m) => (
                    <RowEditor key={m.id} mapping={m} canonicalFields={canonicalFields} onSave={saveMapping} />
                  ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
