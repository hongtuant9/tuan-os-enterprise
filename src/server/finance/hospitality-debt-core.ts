export type CanonicalDebtFacilityRow = {
  facility_code?: string | null;
  used_principal?: number | string | null;
  maturity_date?: string | null;
  as_of_date?: string | null;
  classification?: string | null;
  verification_status?: string | null;
  record_status?: string | null;
  source?: string | null;
  source_reference?: string | null;
  updated_at?: string | null;
};

export type CanonicalDebtSummary = {
  state: "VERIFIED" | "NEED_VERIFY";
  principalOutstanding: number | null;
  maturityDate: string | null;
  sourceNote: string;
  lastSourceUpdate: string | null;
  confirmationDate: string | null;
  reason?: string;
};

function numeric(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function latest(values: Array<string | null | undefined>) {
  return values.filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
}

function earliest(values: Array<string | null | undefined>) {
  return values.filter((value): value is string => Boolean(value)).sort().at(0) ?? null;
}

function ownerApproved(row: CanonicalDebtFacilityRow) {
  const source = String(row.source ?? "").toUpperCase();
  const ref = String(row.source_reference ?? "").toUpperCase();
  return source.includes("OWNER_APPROVED") || ref.startsWith("DEC-");
}

export function summarizeCanonicalDebtFacilities(rows: CanonicalDebtFacilityRow[]): CanonicalDebtSummary | null {
  const active = rows.filter((row) => String(row.record_status ?? "ACTIVE").toUpperCase() === "ACTIVE");
  if (!active.length) return null;

  const debtRows = active.filter((row) => String(row.classification ?? "").toUpperCase() === "ACTIVE_BANK_DEBT");
  const usedRows = debtRows.filter((row) => (numeric(row.used_principal) ?? 0) > 0);
  const scopeRows = debtRows.length ? debtRows : active;

  const authorityReady = scopeRows.every((row) =>
    String(row.verification_status ?? "").toUpperCase() === "VERIFIED" &&
    Boolean(row.as_of_date) &&
    ownerApproved(row)
  );
  const principals = usedRows.map((row) => numeric(row.used_principal));
  const principalReady = principals.every((value) => value !== null && value! >= 0);

  if (!authorityReady || !principalReady) {
    return {
      state: "NEED_VERIFY",
      principalOutstanding: null,
      maturityDate: earliest(debtRows.map((row) => row.maturity_date)),
      sourceNote: "Canonical finance_credit_facilities exists but authority/verification fields are incomplete.",
      lastSourceUpdate: latest(active.map((row) => row.updated_at)),
      confirmationDate: latest(active.map((row) => row.as_of_date)),
      reason: "Canonical debt rows are present, so older FIN fallback must not override them. Complete verification/as_of/Owner authority first.",
    };
  }

  const principalOutstanding = principals.reduce<number>((sum, value) => sum + (value ?? 0), 0);
  const activeCodes = usedRows.map((row) => String(row.facility_code ?? "").trim()).filter(Boolean);
  return {
    state: "VERIFIED",
    principalOutstanding,
    maturityDate: earliest(usedRows.map((row) => row.maturity_date)),
    sourceNote: `Canonical finance_credit_facilities · active debt: ${activeCodes.join(", ") || "none"}; unused credit facilities excluded from debt.`,
    lastSourceUpdate: latest(active.map((row) => row.updated_at)),
    confirmationDate: latest(active.map((row) => row.as_of_date)),
  };
}
