export type CozyTableDestination = {
  tableNumber: number;
  qrId: string;
  status: "ACTIVE" | "HOLD";
  kiotVietTableId: number | null;
  kiotVietUrl: string | null;
};

const ACTIVE_KIOTVIET_URLS: Record<number, string> = {
  1: "https://emenu.kiotviet.vn/500950302/41925/832530",
  2: "https://emenu.kiotviet.vn/500950302/41925/832531",
  3: "https://emenu.kiotviet.vn/500950302/41925/832532",
  4: "https://emenu.kiotviet.vn/500950302/41925/832533",
  5: "https://emenu.kiotviet.vn/500950302/41925/832534",
  6: "https://emenu.kiotviet.vn/500950302/41925/832535",
  7: "https://emenu.kiotviet.vn/500950302/41925/832536",
  8: "https://emenu.kiotviet.vn/500950302/41925/832537",
  9: "https://emenu.kiotviet.vn/500950302/41925/832538",
  10: "https://emenu.kiotviet.vn/500950302/41925/832539",
  11: "https://emenu.kiotviet.vn/500950302/41925/832540",
  12: "https://emenu.kiotviet.vn/500950302/41925/832541",
  13: "https://emenu.kiotviet.vn/500950302/41925/832542",
  14: "https://emenu.kiotviet.vn/500950302/41925/832543",
  15: "https://emenu.kiotviet.vn/500950302/41925/832544",
  16: "https://emenu.kiotviet.vn/500950302/41925/832545",
  17: "https://emenu.kiotviet.vn/500950302/41925/832546",
  18: "https://emenu.kiotviet.vn/500950302/41925/832547",
  19: "https://emenu.kiotviet.vn/500950302/41925/832548",
  20: "https://emenu.kiotviet.vn/500950302/41925/832549",
  21: "https://emenu.kiotviet.vn/500950302/41925/832550",
  22: "https://emenu.kiotviet.vn/500950302/41925/832551",
  23: "https://emenu.kiotviet.vn/500950302/41925/832552",
  24: "https://emenu.kiotviet.vn/500950302/41925/832553",
  25: "https://emenu.kiotviet.vn/500950302/41925/832554",
  26: "https://emenu.kiotviet.vn/500950302/41925/832555",
  27: "https://emenu.kiotviet.vn/500950302/41925/832556",
  28: "https://emenu.kiotviet.vn/500950302/41925/832557",
  29: "https://emenu.kiotviet.vn/500950302/41925/832558",
  30: "https://emenu.kiotviet.vn/500950302/41925/832559",
  31: "https://emenu.kiotviet.vn/500950302/41925/832560",
  32: "https://emenu.kiotviet.vn/500950302/41925/832561",
  33: "https://emenu.kiotviet.vn/500950302/41925/832562",
  34: "https://emenu.kiotviet.vn/500950302/41925/832563",
  35: "https://emenu.kiotviet.vn/500950302/41925/832564",
  36: "https://emenu.kiotviet.vn/500950302/41925/832565",
  37: "https://emenu.kiotviet.vn/500950302/41925/832566",
};

export function cozyTableDestination(tableNumber: number): CozyTableDestination | null {
  if (!Number.isInteger(tableNumber) || tableNumber < 1 || tableNumber > 40) return null;
  const url = ACTIVE_KIOTVIET_URLS[tableNumber] ?? null;
  const kiotVietTableId = url ? Number(url.split("/").at(-1)) : null;
  return {
    tableNumber,
    qrId: `table_${String(tableNumber).padStart(2, "0")}`,
    status: url ? "ACTIVE" : "HOLD",
    kiotVietTableId,
    kiotVietUrl: url,
  };
}

export function parseCozyTableNumber(value: unknown): number | null {
  const text = typeof value === "string" ? value.trim() : "";
  if (!/^\d{1,2}$/.test(text)) return null;
  const number = Number(text);
  return number >= 1 && number <= 40 ? number : null;
}
