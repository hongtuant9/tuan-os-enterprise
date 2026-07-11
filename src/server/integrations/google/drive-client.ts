import "server-only";
import { google, Auth } from "googleapis";

export type GoogleFileMetadata = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
};

export async function getFileMetadata(fileId: string, auth: Auth.OAuth2Client): Promise<GoogleFileMetadata> {
  const drive = google.drive({ version: "v3", auth });
  const { data } = await drive.files.get({
    fileId,
    fields: "id,name,mimeType,modifiedTime",
  });

  return {
    id: data.id ?? fileId,
    name: data.name ?? "",
    mimeType: data.mimeType ?? "",
    modifiedTime: data.modifiedTime ?? "",
  };
}

export async function getSheetValues(spreadsheetId: string, range: string, auth: Auth.OAuth2Client): Promise<string[][]> {
  const sheets = google.sheets({ version: "v4", auth });
  const { data } = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  return (data.values as string[][] | undefined) ?? [];
}

/** Flattens a Google Doc's body into one string per non-empty paragraph. */
export async function getDocParagraphs(documentId: string, auth: Auth.OAuth2Client): Promise<string[]> {
  const docs = google.docs({ version: "v1", auth });
  const { data } = await docs.documents.get({ documentId });

  const paragraphs: string[] = [];
  for (const element of data.body?.content ?? []) {
    const text = (element.paragraph?.elements ?? [])
      .map((el) => el.textRun?.content ?? "")
      .join("")
      .trim();
    if (text) paragraphs.push(text);
  }
  return paragraphs;
}
