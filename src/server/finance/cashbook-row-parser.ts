export type ParsedCashbookRow = {
  id: string;
  transDate: string;
  amount: number;
  isReceipt: boolean | null;
  groupLabel: string;
  status: string;
};

function parseMoneyToken(value: string) {
  const digits = value.replace(/[^0-9-]/g, "");
  if (!digits) return null;
  const parsed = Number(digits);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseCashbookRowText(text: string): ParsedCashbookRow | null {
  const normalized = text.replace(/\s+/g, " ").trim();
  const dateMatch = normalized.match(/(\d{2}\/\d{2}\/\d{4}(?:\s+\d{2}:\d{2})?)/);
  const id = normalized.split(/\s+/)[0] || "";
  if (!dateMatch || !id || dateMatch.index === undefined) return null;

  const tailStart = dateMatch.index + dateMatch[0].length;
  const tail = normalized.slice(tailStart).trim();
  const moneyMatches = [...tail.matchAll(/-?(?:\d{1,3}(?:[.,]\d{3})+|\d{4,})/g)];
  const amountToken = moneyMatches.at(-1);
  if (!amountToken || amountToken.index === undefined) return null;

  const amount = parseMoneyToken(amountToken[0]);
  if (amount === null) return null;

  const beforeAmount = tail.slice(0, amountToken.index).trim();
  const afterAmount = tail.slice(amountToken.index + amountToken[0].length).trim();
  const groupLabel = [beforeAmount, afterAmount]
    .filter(Boolean)
    .join(" ")
    .replace(/\b(?:Đã thanh toán|Đã thu|Đã chi)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  let isReceipt: boolean | null = null;
  if (/\[TCE-(?:R|RN)|\bThu\b/i.test(groupLabel)) isReceipt = true;
  if (/\[TCE-(?:C|F|H|N)|\bChi\b/i.test(groupLabel)) isReceipt = false;

  return {
    id,
    transDate: dateMatch[1],
    amount: Math.abs(amount),
    isReceipt,
    groupLabel,
    status: "Đã thanh toán",
  };
}
