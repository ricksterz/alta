import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../lib/api";
import type { CanonicalField, DocumentTemplateDetail, FieldMapping, FieldMappingType } from "../../lib/types";

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
    <tr className="border-b border-slate-100">
      <td className="py-3 pr-4">
        <div className="text-sm font-medium text-slate-800">{mapping.anvilFieldLabel ?? mapping.anvilFieldKey}</div>
        <div className="text-xs text-slate-400">{mapping.anvilFieldKey}</div>
      </td>
      <td className="py-3 pr-4">
        <select
          className="rounded border border-slate-300 px-2 py-1.5 text-sm"
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
            className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
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
            className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
            placeholder="Constant value for this field"
            value={staticValue}
            onChange={(e) => setStaticValue(e.target.value)}
          />
        )}
        {mappingType === "unmapped" && <span className="text-sm text-slate-300">—</span>}
      </td>
      <td className="py-3 text-right">
        <button
          type="button"
          disabled={!dirty || saving}
          onClick={save}
          className="rounded border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </td>
    </tr>
  );
}

export function TemplateMappingPage() {
  const { id } = useParams<{ id: string }>();
  const [template, setTemplate] = useState<DocumentTemplateDetail | null>(null);
  const [canonicalFields, setCanonicalFields] = useState<CanonicalField[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!id) return;
    api
      .get<DocumentTemplateDetail>(`/templates/${id}`)
      .then(setTemplate)
      .catch((err) => setError(err.message));
  }, [id]);

  useEffect(load, [load]);

  useEffect(() => {
    api
      .get<{ version: number; fields: CanonicalField[] }>("/canonical-fields")
      .then((res) => setCanonicalFields(res.fields))
      .catch(() => setCanonicalFields([]));
  }, []);

  async function saveMapping(
    mappingId: string,
    patch: { mappingType: FieldMappingType; canonicalField?: string; staticValue?: string }
  ) {
    if (!id) return;
    await api.patch(`/templates/${id}/mappings/${mappingId}`, patch);
    load();
  }

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!template) return <p className="text-slate-500">Loading…</p>;

  const unmappedCount = template.fieldMappings.filter((m) => m.mappingType === "unmapped").length;

  return (
    <div>
      <Link to={`/funds/${template.fundId}`} className="mb-4 inline-block text-sm text-slate-500 hover:underline">
        ← Back to fund
      </Link>

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{template.originalFilename}</h1>
          <p className="text-sm text-slate-500">{template.fieldMappings.length} detected fields</p>
        </div>
        <span
          className={`rounded px-3 py-1 text-sm font-medium ${
            unmappedCount > 0 ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"
          }`}
        >
          {unmappedCount > 0 ? `${unmappedCount} unmapped` : "All fields mapped"}
        </span>
      </div>

      {template.fieldMappings.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 py-16 text-center text-slate-500">
          No fields were auto-detected for this template. This can happen if Anvil's field-detection
          response came back in an unrecognized shape — check the stored raw response before assuming
          the PDF has no fillable fields.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white p-6">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-400">
              <tr>
                <th className="pb-2 pr-4">Detected field</th>
                <th className="pb-2 pr-4">Mapping type</th>
                <th className="pb-2 pr-4">Value</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {template.fieldMappings.map((m) => (
                <RowEditor key={m.id} mapping={m} canonicalFields={canonicalFields} onSave={saveMapping} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
