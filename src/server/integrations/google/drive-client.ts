import "server-only";

export type GoogleFileMetadata = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
};

async function googleGet<T>(url: string, accessToken: string): Promise<T> {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google API request to ${new URL(url).pathname} failed (${response.status}): ${text}`);
  }

  return response.json();
}

export async function getFileMetadata(fileId: string, accessToken: string): Promise<GoogleFileMetadata> {
  const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,modifiedTime`;
  return googleGet<GoogleFileMetadata>(url, accessToken);
}

type SheetValuesResponse = {
  range: string;
  values?: string[][];
};

export async function getSheetValues(
  spreadsheetId: string,
  range: string,
  accessToken: string
): Promise<string[][]> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`;
  const result = await googleGet<SheetValuesResponse>(url, accessToken);
  return result.values ?? [];
}

type DocsParagraphElement = { textRun?: { content?: string } };
type DocsStructuralElement = { paragraph?: { elements?: DocsParagraphElement[] } };
type DocsDocument = { body?: { content?: DocsStructuralElement[] } };

/** Flattens a Google Doc's body into one string per non-empty paragraph. */
export async function getDocParagraphs(documentId: string, accessToken: string): Promise<string[]> {
  const url = `https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}`;
  const doc = await googleGet<DocsDocument>(url, accessToken);

  const paragraphs: string[] = [];
  for (const element of doc.body?.content ?? []) {
    const text = (element.paragraph?.elements ?? [])
      .map((el) => el.textRun?.content ?? "")
      .join("")
      .trim();
    if (text) paragraphs.push(text);
  }
  return paragraphs;
}
