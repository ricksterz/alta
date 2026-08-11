// Wrapper around Anvil's PDF template API.
//
// Everything below is VERIFIED against a live account and the published SDL —
// not inferred from prose docs. Where Phase 2 had to guess, the guesses and
// their outcomes are recorded, because the difference between "documented" and
// "observed" is exactly what broke Phase 3 planning for two weeks.
//
// Verified:
//   - Endpoint for multipart mutations is https://graphql.useanvil.com.
//     app.useanvil.com/graphql serves the SDL but is not the upload host.
//   - Auth is HTTP Basic with the API key as username and an EMPTY password,
//     i.e. base64("KEY:").
//   - createCast takes (organizationEid, title, file: Upload!, isTemplate,
//     allowedAliasIds, detectFields, advancedDetectFields, detectBoxesAdvanced,
//     schemaSource, schema).
//   - Cast.fieldInfo is a JSON scalar shaped { fields: [...] } — an OBJECT with
//     a `fields` array, not a bare array.
//   - Each field is { id, name, type, pageNum, rect: {x,y,width,height} }.
//   - pageNum is ZERO-indexed.
//   - Cast.exampleData is the authoritative fill payload shape for a given
//     template: its KEYS are the keys /api/v1/fill expects.
//
// Free-tier boundary, verified by a successful call on a free account:
//   detectFields          — basic detection from the PDF's own AcroForm
//                           metadata. Free. Finds fields a fillable PDF
//                           already declares.
//   advancedDetectFields  — "Uses AI to help analyze the document's fields"
//   detectBoxesAdvanced   — "Uses AI to help detect the document's fields"
//                           Both are Document AI, which needs the AI Pack
//                           ($99/mo). Defaulted OFF so a free account cannot
//                           accidentally trip a paid feature.
//
// The practical consequence: a PDF that already has form fields works for
// free. A flat scanned document needs Document AI, and the honest answer for a
// free account is to build the template in Anvil's web UI (where Document AI
// is included) and import it by eid — see importTemplate below.

const GRAPHQL_ENDPOINT = "https://graphql.useanvil.com";

const CREATE_CAST_MUTATION = `
  mutation CreateCast(
    $title: String,
    $file: Upload!,
    $isTemplate: Boolean,
    $detectFields: Boolean,
    $advancedDetectFields: Boolean,
    $detectBoxesAdvanced: Boolean
  ) {
    createCast(
      title: $title,
      file: $file,
      isTemplate: $isTemplate,
      detectFields: $detectFields,
      advancedDetectFields: $advancedDetectFields,
      detectBoxesAdvanced: $detectBoxesAdvanced
    ) {
      eid
      name
      title
      isTemplate
      fieldInfo
      exampleData
      allowedAliasIds
    }
  }
`;

const CAST_QUERY = `
  query Cast($eid: String!) {
    cast(eid: $eid) {
      eid
      name
      title
      isTemplate
      fieldInfo
      exampleData
      allowedAliasIds
    }
  }
`;

export interface PdfFile {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}

/** One field as Anvil reports it. Shape confirmed against a live response. */
export interface AnvilDetectedField {
  /** Stable identifier within the PDF, e.g. "investorLegalName0". */
  id: string;
  /** Human label from the PDF's own field name. */
  name?: string;
  /** Anvil's type vocabulary, e.g. "shortText". Treated as opaque. */
  type?: string;
  /** ZERO-indexed in Anvil's response. Normalised to 1-based below. */
  pageNum?: number;
  rect?: { x: number; y: number; width: number; height: number };
}

export interface TemplateFields {
  anvilTemplateId: string;
  title: string | null;
  /** Raw fieldInfo, stored verbatim so the mapping UI never re-calls Anvil. */
  detectedFieldsRaw: unknown;
  /** Normalised for Alta's own use. pageNum is 1-based here. */
  fields: (AnvilDetectedField & { pageNum: number })[];
  /**
   * The keys /api/v1/fill expects for this template. Taken from exampleData
   * rather than assumed to be field ids: when a template defines alias ids,
   * those become the fill keys instead. Reading it per template is the only
   * way to be right in both cases.
   */
  fillKeys: string[];
}

function authHeader(apiKey: string): string {
  return `Basic ${Buffer.from(`${apiKey}:`, "ascii").toString("base64")}`;
}

function requireKey(): string {
  const apiKey = process.env.ANVIL_API_KEY;
  if (!apiKey) throw new Error("ANVIL_API_KEY is not set");
  return apiKey;
}

/**
 * Pulls {id, name, type, pageNum, rect} out of a fieldInfo payload.
 *
 * Accepts both the observed `{ fields: [...] }` shape and a bare array. The
 * bare-array branch is defensive rather than observed — Anvil types fieldInfo
 * as an untyped JSON scalar, so nothing in the schema stops it changing.
 */
export function parseFieldInfo(raw: unknown): (AnvilDetectedField & { pageNum: number })[] {
  const candidates = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { fields?: unknown }).fields)
      ? ((raw as { fields: unknown[] }).fields)
      : [];

  return candidates
    .filter((f): f is Record<string, unknown> => Boolean(f) && typeof f === "object" && "id" in f)
    .map((f) => ({
      id: String(f.id),
      name: typeof f.name === "string" ? f.name : undefined,
      type: typeof f.type === "string" ? f.type : undefined,
      // Anvil is 0-indexed; every page number Alta shows a human is 1-based.
      pageNum: typeof f.pageNum === "number" ? f.pageNum + 1 : 1,
      rect: f.rect as AnvilDetectedField["rect"],
    }));
}

function toTemplateFields(cast: {
  eid: string;
  title: string | null;
  fieldInfo: unknown;
  exampleData: unknown;
}): TemplateFields {
  const fields = parseFieldInfo(cast.fieldInfo);
  const fillKeys =
    cast.exampleData && typeof cast.exampleData === "object"
      ? Object.keys(cast.exampleData as Record<string, unknown>)
      : fields.map((f) => f.id);

  return {
    anvilTemplateId: cast.eid,
    title: cast.title ?? null,
    detectedFieldsRaw: cast.fieldInfo,
    fields,
    fillKeys,
  };
}

async function graphql<T>(
  body: FormData | string,
  headers: Record<string, string> = {}
): Promise<T> {
  const res = await fetch(GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: { Authorization: authHeader(requireKey()), ...headers },
    body,
  });
  if (!res.ok) {
    throw new Error(`Anvil request failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { data?: T; errors?: unknown };
  if (json.errors || !json.data) {
    throw new Error(`Anvil returned errors: ${JSON.stringify(json.errors)}`);
  }
  return json.data;
}

export const AnvilClient = {
  /**
   * Upload a PDF and read back whatever fields Anvil can detect.
   *
   * `useDocumentAI` defaults to false and gates the two paid flags. Left off,
   * this works on a free account for any PDF that already carries AcroForm
   * fields — which is the common case for a sponsor's subscription agreement,
   * since those are usually produced as fillable forms by counsel.
   */
  async uploadAndDetectFields(
    pdfFile: PdfFile,
    opts: { useDocumentAI?: boolean } = {}
  ): Promise<TemplateFields> {
    const useAI = opts.useDocumentAI ?? false;

    const operations = JSON.stringify({
      query: CREATE_CAST_MUTATION,
      variables: {
        title: pdfFile.filename,
        file: null,
        isTemplate: true,
        detectFields: true,
        advancedDetectFields: useAI,
        detectBoxesAdvanced: useAI,
      },
    });

    const form = new FormData();
    form.append("operations", operations);
    form.append("map", JSON.stringify({ "0": ["variables.file"] }));
    form.append(
      "0",
      new Blob([pdfFile.buffer], { type: pdfFile.mimeType }),
      pdfFile.filename
    );

    const data = await graphql<{ createCast: Parameters<typeof toTemplateFields>[0] }>(form);
    return toTemplateFields(data.createCast);
  },

  /**
   * Import a template that already exists in the sponsor's Anvil account.
   *
   * The free-tier path for documents that need Document AI: a GP ops user
   * builds and reviews the template in Anvil's web UI, where Document AI is
   * included, then hands Alta the Cast eid. Arguably the better flow
   * regardless — someone should look at auto-detected fields on a 90-page
   * agreement before they become live mapping targets.
   */
  async importTemplate(castEid: string): Promise<TemplateFields> {
    const data = await graphql<{ cast: Parameters<typeof toTemplateFields>[0] | null }>(
      JSON.stringify({ query: CAST_QUERY, variables: { eid: castEid } }),
      { "Content-Type": "application/json" }
    );
    if (!data.cast) {
      throw new Error(`No Anvil template found with eid "${castEid}"`);
    }
    return toTemplateFields(data.cast);
  },
};
