import "server-only";
import { drive } from "@googleapis/drive";
import { sheets } from "@googleapis/sheets";
import { docs } from "@googleapis/docs";
import type { OAuth2Client } from "google-auth-library";

export type GoogleFileMetadata = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
};

export async function getFileMetadata(
  fileId: string,
  auth: OAuth2Client
): Promise<GoogleFileMetadata> {
  const client = drive({
    version: "v3",
    auth,
  });

  const { data } = await client.files.get({
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

export async function getSheetValues(
  spreadsheetId: string,
  range: string,
  auth: OAuth2Client
): Promise<string[][]> {
  const client = sheets({
    version: "v4",
    auth,
  });

  const { data } = await client.spreadsheets.values.get({
    spreadsheetId,
    range,
  });

  return (data.values as string[][] | undefined) ?? [];
}

export async function getDocParagraphs(
  documentId: string,
  auth: OAuth2Client
): Promise<string[]> {
  const client = docs({
    version: "v1",
    auth,
  });

  const { data } = await client.documents.get({
    documentId,
  });

  const paragraphs: string[] = [];

  for (const element of data.body?.content ?? []) {
    const text = (element.paragraph?.elements ?? [])
      .map((el) => el.textRun?.content ?? "")
      .join("")
      .trim();

    if (text) {
      paragraphs.push(text);
    }
  }

  return paragraphs;
}
