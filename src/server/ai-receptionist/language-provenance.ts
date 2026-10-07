import { customerLanguageName, detectGuestLanguage, type GuestLanguage } from "./language.ts";

export type LanguageProvenanceInput = {
  content: string;
  providerTranslated?: boolean;
  sourceLanguage?: string | null;
  manualOverride?: string | null;
};

export type LanguageProvenance = {
  displayLanguage: string;
  customerLanguage: string;
  sourceLanguage: string | null;
  languageSource: "manual_override" | "provider_source" | "provider_translated_unknown" | "content_detection";
  languageNeedsVerify: boolean;
  renderLanguage: GuestLanguage;
};

export function resolveLanguageProvenance(input: LanguageProvenanceInput): LanguageProvenance {
  const display = detectGuestLanguage(input.content);
  const manualOverride = input.manualOverride?.trim().toLowerCase() || "";
  if (manualOverride) {
    return {
      displayLanguage: display.code,
      customerLanguage: manualOverride,
      sourceLanguage: input.sourceLanguage?.trim().toLowerCase() || manualOverride,
      languageSource: "manual_override",
      languageNeedsVerify: false,
      renderLanguage: {
        code: manualOverride,
        name: customerLanguageName(manualOverride),
        confidence: "high",
      },
    };
  }

  const sourceLanguage = input.sourceLanguage?.trim().toLowerCase() || "";
  if (sourceLanguage) {
    return {
      displayLanguage: display.code,
      customerLanguage: sourceLanguage,
      sourceLanguage,
      languageSource: "provider_source",
      languageNeedsVerify: false,
      renderLanguage: {
        code: sourceLanguage,
        name: customerLanguageName(sourceLanguage),
        confidence: "high",
      },
    };
  }

  if (input.providerTranslated) {
    return {
      displayLanguage: display.code,
      customerLanguage: "und",
      sourceLanguage: null,
      languageSource: "provider_translated_unknown",
      languageNeedsVerify: true,
      // The received text may still be useful for an internal Shadow draft.
      // Never treat this render language as verified customer language.
      renderLanguage: display,
    };
  }

  return {
    displayLanguage: display.code,
    customerLanguage: display.code,
    sourceLanguage: display.code,
    languageSource: "content_detection",
    languageNeedsVerify: false,
    renderLanguage: display,
  };
}

export function canUseCustomerLanguageForOutbound(input: {
  customerLanguage: string;
  languageNeedsVerify: boolean;
}): boolean {
  return !input.languageNeedsVerify && Boolean(input.customerLanguage.trim()) && input.customerLanguage !== "und";
}
