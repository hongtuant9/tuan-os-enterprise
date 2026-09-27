export type CashbookExpenseRow = {
  id: string;
  transDate: string;
  amount: number;
  isReceipt: boolean | null;
  groupLabel: string;
  status: string;
};

export type ExpenseActualGroup = {
  code: string;
  canonicalCategory: string;
  amount: number;
  transactionCount: number;
  directSheetTargets: string[];
  verificationStatus: "VERIFIED" | "NEED_VERIFY";
  note: string;
};

const DIRECT_MAP: Record<string, { category: string; targets: string[] }> = {
  C02: { category: "Điện", targets: ["Điện"] },
  C03: { category: "Nước", targets: ["Nước"] },
  C04: { category: "Internet & viễn thông", targets: ["Internet / điện thoại", "Internet / POS / phần mềm"] },
  C06: { category: "Marketing & bán hàng", targets: ["Ads / content / phí marketing thực tế", "Ads / content / khuyến mại do cửa hàng chịu"] },
  C07: { category: "Sửa chữa & bảo trì", targets: ["Sửa chữa / bảo trì nhỏ", "Sửa chữa / bảo trì thiết bị nhỏ"] },
  C09: { category: "Thuế & phí hoạt động", targets: ["Thuế / phí"] },
  C10: { category: "Lãi vay & phí ngân hàng", targets: ["Phí thanh toán / ngân hàng liên quan bán hàng", "Phí thanh toán / ngân hàng / nền tảng"] },
  C11: { category: "Chi phí khác có chứng từ", targets: ["Chi phí vận hành khác"] },
  F01: { category: "Gas / nhiên liệu bếp", targets: ["Gas / nhiên liệu bếp"] },
  H01: { category: "Hoa hồng OTA / kênh bán", targets: ["Hoa hồng OTA / channel commission"] },
  H02: { category: "Giặt là / buồng phòng thuê ngoài", targets: ["Giặt là / laundry"] },
  H03: { category: "Tour / vận chuyển / dịch vụ đối tác", targets: ["Dịch vụ thuê ngoài / vận chuyển / hành chính"] },
};

const AMBIGUOUS_CODES = new Set(["C01", "C05", "C08"]);
const NON_PNL_CODES = new Set(["N01", "N02", "N03", "N04", "N05"]);
const RECEIPT_CODES = new Set(["R01", "RN01", "RN02"]);

const LEGACY_NAME_TO_CODE: Array<[string, string]> = [
  ["chi phi khac co giai trinh", "C11"],
  ["chi phi thue kho bai, mat bang kinh doanh", "C05"],
  ["chi phi hoi nghi, su kien, cong tac phi", "C08"],
  ["bao hiem / chi phi nhan su bat buoc neu phat sinh", "C01"],
  ["chi phi le/tet/trang tri lon", "C06"],
  ["chi phi vien thong", "C04"],
  ["chi phi nhan cong", "C01"],
  ["chi phi dien", "C02"],
  ["chi phi nuoc", "C03"],
  ["nop thue", "C09"],
  ["chi phi khac", "C11"],
  ["dong phuc", "C01"],
  ["gui tien vao ngan hang", "N04"],
];

function normalizeLabel(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function extractTceCode(groupLabel: string) {
  const match = groupLabel.match(/\[TCE-([A-Z0-9]+)\]/i);
  return match?.[1]?.toUpperCase() ?? null;
}

export function resolveExpenseCode(groupLabel: string) {
  const explicit = extractTceCode(groupLabel);
  if (explicit) return explicit;
  const normalized = normalizeLabel(groupLabel);
  for (const [legacyName, code] of LEGACY_NAME_TO_CODE) {
    if (normalized.includes(legacyName)) return code;
  }
  return null;
}

export function summarizeExpenseActualRows(rows: CashbookExpenseRow[]) {
  const grouped = new Map<string, { amount: number; count: number; labels: Set<string> }>();
  let unknownExpenseRows = 0;
  let excludedNonPnlRows = 0;
  const unknownGroupLabels = new Set<string>();

  for (const row of rows) {
    if (row.isReceipt !== false) continue;
    const code = resolveExpenseCode(row.groupLabel);
    if (!code) {
      unknownExpenseRows += 1;
      unknownGroupLabels.add(row.groupLabel);
      continue;
    }
    if (NON_PNL_CODES.has(code) || RECEIPT_CODES.has(code)) {
      excludedNonPnlRows += 1;
      continue;
    }
    const current = grouped.get(code) ?? { amount: 0, count: 0, labels: new Set<string>() };
    current.amount += Math.max(0, row.amount);
    current.count += 1;
    current.labels.add(row.groupLabel);
    grouped.set(code, current);
  }

  const groups: ExpenseActualGroup[] = [...grouped.entries()]
    .map(([code, value]) => {
      const mapped = DIRECT_MAP[code];
      if (mapped) {
        return {
          code,
          canonicalCategory: mapped.category,
          amount: value.amount,
          transactionCount: value.count,
          directSheetTargets: mapped.targets,
          verificationStatus: "VERIFIED" as const,
          note: "Direct one-to-one taxonomy mapping from reconciled cashbook payment rows.",
        };
      }
      return {
        code,
        canonicalCategory:
          code === "C01" ? "Nhân sự / Lương & phụ cấp"
          : code === "C05" ? "Thuê mặt bằng / thuê tài sản"
          : code === "C08" ? "Quản lý & vận hành"
          : "Unmapped expense group",
        amount: value.amount,
        transactionCount: value.count,
        directSheetTargets: [],
        verificationStatus: "NEED_VERIFY" as const,
        note: AMBIGUOUS_CODES.has(code)
          ? "Taxonomy group is broader than FIN-HOSPITALITY Actual rows; do not split without evidence."
          : "No canonical one-to-one FIN-HOSPITALITY mapping.",
      };
    })
    .sort((a, b) => a.code.localeCompare(b.code));

  return {
    groups,
    unknownExpenseRows,
    unknownGroupLabels: [...unknownGroupLabels].sort(),
    excludedNonPnlRows,
    directMappedAmount: groups
      .filter((group) => group.verificationStatus === "VERIFIED")
      .reduce((sum, group) => sum + group.amount, 0),
    ambiguousAmount: groups
      .filter((group) => group.verificationStatus === "NEED_VERIFY")
      .reduce((sum, group) => sum + group.amount, 0),
  };
}
