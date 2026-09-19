export type GuestLanguage = {
  code: string;
  name: string;
  confidence: "high" | "medium" | "low";
};

const SCRIPT_RULES: Array<[RegExp, string, string]> = [
  [/[\u0E00-\u0E7F]/, "th", "Thai"],
  [/[\u3040-\u30ff]/, "ja", "Japanese"],
  [/[\uac00-\ud7af]/, "ko", "Korean"],
  [/[\u4e00-\u9fff]/, "zh", "Chinese"],
  [/[\u0400-\u04FF]/, "ru", "Russian"],
];

const WORD_RULES: Array<[string, string, string[]]> = [
  ["vi", "Vietnamese", ["xin", "chào", "phòng", "giá", "khách", "đặt", "còn", "bữa", "sáng", "nhận", "trả", "người", "anh", "chị", "mình"]],
  ["fr", "French", ["bonjour", "merci", "chambre", "nuit", "prix", "disponible", "réservation", "nous", "avec", "pour"]],
  ["es", "Spanish", ["hola", "gracias", "habitación", "noche", "precio", "disponible", "somos", "para", "con"]],
  ["de", "German", ["hallo", "danke", "zimmer", "nacht", "preis", "verfügbar", "wir", "für", "mit"]],
  ["it", "Italian", ["ciao", "grazie", "camera", "notte", "prezzo", "disponibile", "siamo", "per", "con"]],
  ["pt", "Portuguese", ["olá", "obrigado", "obrigada", "quarto", "noite", "preço", "disponível", "somos", "para"]],
  ["nl", "Dutch", ["hallo", "bedankt", "kamer", "nacht", "prijs", "beschikbaar", "wij", "voor", "met"]],
  ["en", "English", ["hello", "hi", "thanks", "thank", "room", "night", "price", "available", "we", "for", "with"]],
];

export function detectGuestLanguage(text: string): GuestLanguage {
  const raw = text.trim();
  if (!raw) return { code: "en", name: "English", confidence: "low" };

  if (/[đăơư]/i.test(raw)) {
    return { code: "vi", name: "Vietnamese", confidence: "high" };
  }

  for (const [pattern, code, name] of SCRIPT_RULES) {
    if (pattern.test(raw)) return { code, name, confidence: "high" };
  }

  const normalized = ` ${raw.toLowerCase().normalize("NFKC")} `;
  let best: { code: string; name: string; score: number } | null = null;
  for (const [code, name, words] of WORD_RULES) {
    const score = words.reduce((total, word) => total + (normalized.includes(` ${word} `) ? 1 : 0), 0);
    if (!best || score > best.score) best = { code, name, score };
  }
  if (best && best.score >= 2) {
    return { code: best.code, name: best.name, confidence: "high" };
  }
  if (best && best.score === 1) {
    return { code: best.code, name: best.name, confidence: "medium" };
  }

  return { code: "en", name: "English", confidence: "low" };
}

export function languageInstruction(language: GuestLanguage): string {
  if (language.confidence === "low") {
    return "Detect the guest's language from their latest message and reply in that same language.";
  }
  return `Reply in ${language.name} (${language.code}), matching the guest's language.`;
}
