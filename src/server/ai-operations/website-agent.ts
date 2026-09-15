export type WebsiteAuditSeverity = "P0" | "P1" | "P2" | "P3";

export interface WebsiteCanonicalPage {
  url: string;
  expectedStatus?: number;
  requiredText?: string[];
  forbiddenText?: string[];
  canonicalUrl?: string;
  sourceOfTruth: string;
}

export interface WebsiteObservation {
  url: string;
  observedAt: string;
  status: number;
  finalUrl?: string;
  text?: string;
  title?: string;
  hasGtm?: boolean;
  hasGa4?: boolean;
}

export interface WebsiteFinding {
  key: string;
  url: string;
  severity: WebsiteAuditSeverity;
  category: "availability" | "content" | "redirect" | "tracking";
  summary: string;
  evidence?: string;
  mutationAllowed: false;
  recommendedAction: string;
}

function key(url: string, suffix: string) {
  return `WEB-${Buffer.from(url).toString("base64url").slice(0, 16)}-${suffix}`;
}
export function auditWebsitePage(canonical: WebsiteCanonicalPage, observed?: WebsiteObservation): WebsiteFinding[] {
  if (!observed) {
    return [{
      key: key(canonical.url, "missing"), url: canonical.url, severity: "P1", category: "availability",
      summary: "No fresh website observation available.", mutationAllowed: false,
      recommendedAction: "Collect read-only HTTP/browser evidence before proposing any change.",
    }];
  }

  const findings: WebsiteFinding[] = [];
  const expectedStatus = canonical.expectedStatus ?? 200;
  if (observed.status !== expectedStatus) findings.push({
    key: key(canonical.url, "status"), url: canonical.url, severity: observed.status >= 500 ? "P0" : "P1", category: "availability",
    summary: `HTTP ${observed.status}; expected ${expectedStatus}.`, evidence: observed.finalUrl,
    mutationAllowed: false, recommendedAction: "Diagnose origin/reverse proxy/app route first; prepare scoped rollback-safe fix.",
  });

  if (canonical.canonicalUrl && observed.finalUrl && observed.finalUrl !== canonical.canonicalUrl) findings.push({
    key: key(canonical.url, "redirect"), url: canonical.url, severity: "P2", category: "redirect",
    summary: "Final URL differs from canonical URL.", evidence: observed.finalUrl,
    mutationAllowed: false, recommendedAction: "Verify intended redirect/canonical policy before any public URL mutation.",
  });
  const body = observed.text ?? "";
  for (const required of canonical.requiredText ?? []) {
    if (!body.includes(required)) findings.push({
      key: key(canonical.url, `missing-${required}`), url: canonical.url, severity: "P2", category: "content",
      summary: `Required canonical content is missing: ${required}`, mutationAllowed: false,
      recommendedAction: "Compare with WEB-TCE-001/L3 and prepare a minimal content patch with before/after evidence.",
    });
  }
  for (const forbidden of canonical.forbiddenText ?? []) {
    if (body.includes(forbidden)) findings.push({
      key: key(canonical.url, `forbidden-${forbidden}`), url: canonical.url, severity: "P1", category: "content",
      summary: `Forbidden/stale content detected: ${forbidden}`, mutationAllowed: false,
      recommendedAction: "Confirm source authority, then prepare a scoped removal rather than broad search/replace.",
    });
  }

  if (observed.hasGtm === false || observed.hasGa4 === false) findings.push({
    key: key(canonical.url, "tracking"), url: canonical.url, severity: "P1", category: "tracking",
    summary: "Expected GTM/GA4 tracking signal is missing.",
    evidence: `GTM=${String(observed.hasGtm)} GA4=${String(observed.hasGa4)}`,
    mutationAllowed: false, recommendedAction: "Re-verify tag delivery and consent/loading conditions before editing GTM or site code.",
  });

  return findings;
}

export function auditWebsite(pages: WebsiteCanonicalPage[], observations: WebsiteObservation[]) {
  const byUrl = new Map(observations.map((item) => [item.url, item]));
  const findings = pages.flatMap((page) => auditWebsitePage(page, byUrl.get(page.url)));
  return { mode: "read_only_shadow" as const, canMutate: false as const, generatedAt: new Date().toISOString(), findings };
}
