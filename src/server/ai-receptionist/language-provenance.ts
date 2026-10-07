export type ProvenanceLanguage = {
  code: string;
  name: string;
  confidence: "high" | "medium" | "low";
};

export type LanguageProvenanceInput = {
  displayLanguage: ProvenanceLanguage;
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
  renderLanguage: ProvenanceLanguage;
};

const LANGUAGE_NAME: Record<string, string> = {
  vi: "Vietnamese",
  en: "English",
  fr: "French",
  es: "Spanish",
  de: "German",
  it: "Italian",
  pt: "Portuguese",
  nl: "Dutch",
  zh: "Chinese",
  ja: "Japanese",
  ko: "Korean",
  ru: "Russian",
  th: "Thai",
};

function languageName(code: string): string {
  return LANGUAGE_NAME[code] ?? code.toUpperCase();
}

export function resolveLanguageProvenance(input: LanguageProvenanceInput): LanguageProvenance {
  const display = input.displayLanguage;
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
        name: languageName(manualOverride),
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
        name: languageName(sourceLanguage),
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
