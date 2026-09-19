import "server-only";
import type { Json } from "@/lib/supabase/types";
import { AiReceptionistRepository } from "@/server/repositories/ai-receptionist.repository";

export const RECEPTIONIST_KNOWLEDGE_SOURCES = [
  "l3-property-info",
  "l3-pricing",
  "l3-policy",
  "l3-services",
  "l3-products",
] as const;

export type KnowledgeFact = {
  sourceKey: string;
  externalId: string;
  entity?: string;
  label: string;
  value: string;
  status: string;
  allowedUse: string;
  syncedAt: string;
};

export type KnowledgeResolution = {
  facts: KnowledgeFact[];
  missing: boolean;
  checkedSources: string[];
};

function normalize(value: unknown): string {
  return String(value ?? "").trim();
}

function pickField(data: Record<string, Json>, patterns: RegExp[]): string {
  for (const [key, value] of Object.entries(data)) {
    if (patterns.some((pattern) => pattern.test(key))) {
      const text = normalize(value);
      if (text) return text;
    }
  }
  return "";
}

function isVerified(data: Record<string, Json>): boolean {
  const status = pickField(data, [
    /verification.*status/i,
    /trạng thái.*xác minh/i,
    /^status$/i,
    /trạng thái/i,
  ]).toUpperCase();
  if (!status) return false;
  if (/NEED VERIFY|HOLD|INACTIVE|SUPERSEDED|CẦN XÁC MINH|CHƯA XÁC MINH|TẠM GIỮ/.test(status)) return false;
  return /VERIFIED|ĐÃ XÁC MINH|ĐÃ XÁC NHẬN|ĐANG ÁP DỤNG|ACTIVE/.test(status);
}

function allowedForCustomer(data: Record<string, Json>): boolean {
  const allowed = pickField(data, [/allowed.*use/i, /phạm vi.*sử dụng/i, /được phép dùng/i]).toUpperCase();
  return Boolean(allowed) && /AI_RESPONSE|SALES|PUBLIC/.test(allowed);
}

function expandQuery(text: string): string {
  const lower = text.toLowerCase();
  const additions: string[] = [];
  if (/(check.?in|nhận phòng|arriv|entrada|ankunft|arrivo|chegada|aankomst)/i.test(lower)) additions.push("check-in nhận phòng");
  if (/(check.?out|trả phòng|départ|salida|abreise|partenza|saída|vertrek)/i.test(lower)) additions.push("check-out trả phòng");
  if (/(breakfast|bữa sáng|petit.?déjeuner|desayuno|frühstück|colazione|café da manhã|ontbijt)/i.test(lower)) additions.push("breakfast bữa sáng");
  if (/(price|giá|prix|precio|preis|prezzo|preço|prijs)/i.test(lower)) additions.push("price giá");
  if (/(room|phòng|chambre|habitación|zimmer|camera|quarto|kamer)/i.test(lower)) additions.push("room phòng");
  if (/(bicycle|bike|xe đạp|vélo|bicicleta|fahrrad|bici|fiets)/i.test(lower)) additions.push("bicycle xe đạp");
  if (/(motorbike|scooter|xe máy|moto|motorrad)/i.test(lower)) additions.push("motorbike xe máy");
  if (/(cooking|nấu ăn|cuisine|cocina|kochkurs|cucina|culinária)/i.test(lower)) additions.push("cooking class nấu ăn");
  return `${text} ${additions.join(" ")}`;
}

function tokenize(text: string): string[] {
  return expandQuery(text)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3);
}

function rowSearchText(data: Record<string, Json>): string {
  return Object.values(data).map(normalize).join(" ").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
}

function scoreRow(data: Record<string, Json>, query: string, entity?: string | null): number {
  const haystack = rowSearchText(data);
  const tokens = tokenize(query);
  let score = tokens.reduce((total, token) => total + (haystack.includes(token) ? 1 : 0), 0);
  if (score > 0 && entity && haystack.includes(entity.toLowerCase())) score += 3;
  return score;
}

function toFact(row: {
  source_key: string;
  external_id: string;
  data: Json;
  synced_at: string;
}): KnowledgeFact | null {
  const data = AiReceptionistRepository.toObject(row.data);
  if (!isVerified(data) || !allowedForCustomer(data)) return null;

  const label = pickField(data, [
    /field|trường dữ liệu|chính sách|tiện nghi.*dịch vụ|product|hạng phòng|mã gói|hạng mục|nội dung|tên.*thông tin|dịch vụ|sản phẩm/i,
  ]) || `${row.source_key} row ${row.external_id}`;
  const value = pickField(data, [
    /giá trị.*chính thức/i,
    /^value$/i,
    /official.*value/i,
    /giá khách thấy/i,
    /^giá$/i,
    /giá trị/i,
    /english/i,
    /vietnamese/i,
    /description/i,
    /mô tả/i,
    /price/i,
  ]);
  if (!value) return null;

  return {
    sourceKey: row.source_key,
    externalId: row.external_id,
    entity: pickField(data, [/entity/i, /thực thể/i, /cơ sở/i]) || undefined,
    label,
    value,
    status: pickField(data, [/verification.*status/i, /trạng thái.*xác minh/i, /^status$/i, /trạng thái/i]),
    allowedUse: pickField(data, [/allowed.*use/i, /phạm vi.*sử dụng/i, /được phép dùng/i]),
    syncedAt: row.synced_at,
  };
}

export async function resolveKnowledge(
  repo: AiReceptionistRepository,
  query: string,
  entity?: string | null,
  limit = 8
): Promise<KnowledgeResolution> {
  const rows = await repo.findKnowledgeSyncRecords([...RECEPTIONIST_KNOWLEDGE_SOURCES]);
  const ranked = rows
    .map((row) => ({ row, score: scoreRow(AiReceptionistRepository.toObject(row.data), query, entity) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  const facts: KnowledgeFact[] = [];
  for (const item of ranked) {
    const fact = toFact(item.row);
    if (!fact) continue;
    facts.push(fact);
    if (facts.length >= limit) break;
  }

  return {
    facts,
    missing: facts.length === 0,
    checkedSources: [...RECEPTIONIST_KNOWLEDGE_SOURCES],
  };
}
