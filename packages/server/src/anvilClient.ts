// Wrapper around Anvil's Document AI PDF-template upload call.
//
// Confirmed against Anvil's own docs (useanvil.com/docs/api/pdf-templates,
// /docs/api/graphql/reference, /docs/api/getting-started) before writing
// this — not guessed:
//   - Auth: HTTP Basic, API key as username, empty password.
//   - Endpoint: https://app.useanvil.com/graphql (confirmed via the SDL
//     path at app.useanvil.com/graphql/sdl, which 401s without a key rather
//     than 404ing — the path exists).
//   - Mutation: createCast(title, file: Upload!, isTemplate, detectFields,
//     advancedDetectFields, detectBoxesAdvanced) — exact signature from the
//     PDF templates doc page.
//   - File upload: standard graphql-multipart-request-spec (operations +
//     map + indexed file part), since Anvil's `file: Upload!` follows that
//     convention and the official node-anvil client has no dedicated method
//     for this call at all (only a generic requestGraphQL escape hatch).
//
// NOT confirmed: the internal shape of `fieldInfo`, the field on the
// returned Cast that carries the detected fields. Anvil's GraphQL reference
// names it and says it's "detected field information" but the one page that
// would settle its exact shape (the raw SDL) requires an API key to fetch.
// So: store it verbatim, don't assume its structure anywhere downstream.
// Confirm against a real response (or paste the SDL) before Phase 3's PDF
// fill depends on iterating it.

const ANVIL_GRAPHQL_ENDPOINT = "https://app.useanvil.com/graphql";

const CREATE_CAST_MUTATION = `
  mutation CreateCast(
    $title: String,
    $file: Upload!,
    $isTemplate: Boolean,
    $detectFields: Boolean,
    $advancedDetectFields: Boolean,
    $detectBoxesAdvanced: Boolean,
  ) {
    createCast(
      title: $title,
      file: $file,
      isTemplate: $isTemplate,
      detectFields: $detectFields,
      advancedDetectFields: $advancedDetectFields,
      detectBoxesAdvanced: $detectBoxesAdvanced,
    ) {
      eid
      name
      title
      isTemplate
      fieldInfo
    }
  }
`;

export interface PdfFile {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}

export interface UploadAndDetectFieldsResult {
  anvilTemplateId: string; // Cast.eid
  title: string | null;
  // Verbatim `fieldInfo` from Anvil — opaque on purpose, see note above.
  // Stored as-is in DocumentTemplate.detectedFieldsRaw.
  detectedFieldsRaw: unknown;
}

function authHeader(apiKey: string): string {
  return `Basic ${Buffer.from(`${apiKey}:`, "ascii").toString("base64")}`;
}

export const AnvilClient = {
  async uploadAndDetectFields(pdfFile: PdfFile): Promise<UploadAndDetectFieldsResult> {
    const apiKey = process.env.ANVIL_API_KEY;
    if (!apiKey) {
      throw new Error("ANVIL_API_KEY is not set");
    }

    const operations = JSON.stringify({
      query: CREATE_CAST_MUTATION,
      variables: {
        title: pdfFile.filename,
        file: null,
        isTemplate: true,
        detectFields: true,
        advancedDetectFields: true,
        detectBoxesAdvanced: true,
      },
    });
    const map = JSON.stringify({ "0": ["variables.file"] });

    const form = new FormData();
    form.append("operations", operations);
    form.append("map", map);
    form.append(
      "0",
      new Blob([pdfFile.buffer], { type: pdfFile.mimeType }),
      pdfFile.filename
    );

    const res = await fetch(ANVIL_GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: { Authorization: authHeader(apiKey) },
      body: form,
    });

    if (!res.ok) {
      throw new Error(`Anvil createCast failed: ${res.status} ${await res.text()}`);
    }

    const body = (await res.json()) as {
      data?: { createCast?: { eid: string; title: string | null; fieldInfo: unknown } };
      errors?: unknown;
    };

    if (body.errors || !body.data?.createCast) {
      throw new Error(`Anvil createCast returned errors: ${JSON.stringify(body.errors)}`);
    }

    const cast = body.data.createCast;
    return {
      anvilTemplateId: cast.eid,
      title: cast.title ?? null,
      detectedFieldsRaw: cast.fieldInfo,
    };
  },
};
