export type OtaDirectChannel = "booking" | "agoda" | "airbnb" | "expedia";
export type OtaDirectProvider = "booking" | "agoda" | "hotellink";
export type OtaDirectParticipant = "guest" | "property" | "provider";

export type OtaDirectMessage = {
  provider: OtaDirectProvider;
  channel: OtaDirectChannel;
  propertyExternalId: string;
  conversationId: string;
  reservationReference: string | null;
  messageId: string;
  participant: OtaDirectParticipant;
  content: string;
  createdAt: string;
  providerAutoTranslated?: boolean;
};

export type OtaDirectReplyInput = {
  provider: OtaDirectProvider;
  channel: OtaDirectChannel;
  propertyExternalId: string;
  conversationId: string;
  content: string;
};

export type OtaDirectReplyResult = {
  accepted: boolean;
  providerMessageId: string | null;
  guestHasAccount: boolean | null;
  deliveryState: "accepted_pending_confirmation" | "confirmed_visible" | "unknown";
};

export type OtaDirectProviderReadiness = {
  provider: OtaDirectProvider;
  configured: boolean;
  historyReadCapable: boolean;
  replyCapable: boolean;
  reason:
    | "READY"
    | "MISSING_BOOKING_MACHINE_ACCOUNT"
    | "MISSING_AGODA_SUPPLY_AUTH"
    | "HOTELLINK_NO_DOCUMENTED_API"
    | "DIRECT_REPLY_DISABLED";
};

export interface OtaDirectMessagingTransport {
  readonly provider: OtaDirectProvider;
  readiness(): OtaDirectProviderReadiness;
  fetchConversation(input: {
    propertyExternalId: string;
    conversationId: string;
    pageId?: string | null;
  }): Promise<{ messages: OtaDirectMessage[]; nextPageId: string | null; access: "read_write" | "read_only" | "unknown" }>;
  sendReply(input: OtaDirectReplyInput): Promise<OtaDirectReplyResult>;
}

function envSet(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

function directReplyEnabled(): boolean {
  return process.env.TCE_OTA_DIRECT_REPLY_ENABLED?.trim().toLowerCase() === "true";
}

async function parseJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`OTA provider returned non-JSON HTTP ${response.status}`);
  }
}

export class BookingMessagingTransport implements OtaDirectMessagingTransport {
  readonly provider = "booking" as const;
  private cachedToken: { value: string; expiresAt: number } | null = null;

  readiness(): OtaDirectProviderReadiness {
    const configured = envSet("TCE_BOOKING_CONNECTIVITY_CLIENT_ID") && envSet("TCE_BOOKING_CONNECTIVITY_CLIENT_SECRET");
    if (!configured) return { provider: this.provider, configured: false, historyReadCapable: false, replyCapable: false, reason: "MISSING_BOOKING_MACHINE_ACCOUNT" };
    return {
      provider: this.provider,
      configured: true,
      historyReadCapable: true,
      replyCapable: directReplyEnabled(),
      reason: directReplyEnabled() ? "READY" : "DIRECT_REPLY_DISABLED",
    };
  }

  private async token(): Promise<string> {
    if (this.cachedToken && this.cachedToken.expiresAt > Date.now() + 60_000) return this.cachedToken.value;
    const clientId = process.env.TCE_BOOKING_CONNECTIVITY_CLIENT_ID?.trim();
    const clientSecret = process.env.TCE_BOOKING_CONNECTIVITY_CLIENT_SECRET?.trim();
    if (!clientId || !clientSecret) throw new Error("Booking.com machine account is not configured.");
    const response = await fetch("https://connectivity-authentication.booking.com/token-based-authentication/exchange", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret }),
      cache: "no-store",
    });
    const payload = await parseJson(response);
    const jwt = typeof payload.jwt === "string" ? payload.jwt : "";
    if (!response.ok || !jwt) throw new Error(`Booking.com token exchange failed HTTP ${response.status}`);
    this.cachedToken = { value: jwt, expiresAt: Date.now() + 50 * 60 * 1000 };
    return jwt;
  }

  private async request(path: string, init?: RequestInit): Promise<Response> {
    const jwt = await this.token();
    return fetch(`https://supply-xml.booking.com/messaging${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${jwt}`,
        "Accept-Version": "1.3",
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    });
  }

  async fetchConversation(input: { propertyExternalId: string; conversationId: string; pageId?: string | null }) {
    const query = input.pageId ? `?page_id=${encodeURIComponent(input.pageId)}` : "";
    const response = await this.request(`/properties/${encodeURIComponent(input.propertyExternalId)}/conversations/${encodeURIComponent(input.conversationId)}${query}`);
    const payload = await parseJson(response);
    if (!response.ok) throw new Error(`Booking.com conversation read failed HTTP ${response.status}`);
    const data = (payload.data && typeof payload.data === "object" ? payload.data : {}) as Record<string, unknown>;
    const conversation = (data.conversation && typeof data.conversation === "object" ? data.conversation : data) as Record<string, unknown>;
    const rawMessages = Array.isArray(conversation.messages) ? conversation.messages : [];
    const messages: OtaDirectMessage[] = rawMessages.flatMap((raw) => {
      if (!raw || typeof raw !== "object") return [];
      const item = raw as Record<string, unknown>;
      const messageId = String(item.message_id ?? "").trim();
      const content = String(item.content ?? "").trim();
      const createdAt = String(item.timestamp ?? "").trim();
      if (!messageId || !content || !createdAt) return [];
      const sender = String(item.sender_type ?? item.participant_type ?? "").toLowerCase();
      return [{
        provider: "booking",
        channel: "booking",
        propertyExternalId: input.propertyExternalId,
        conversationId: input.conversationId,
        reservationReference: typeof conversation.conversation_reference === "string" ? conversation.conversation_reference : null,
        messageId,
        participant: sender === "guest" ? "guest" : sender === "property" ? "property" : "provider",
        content,
        createdAt,
      }];
    });
    return {
      messages,
      nextPageId: typeof data.next_page_id === "string" ? data.next_page_id : null,
      access: conversation.access === "read_write" ? "read_write" as const : conversation.access === "read_only" ? "read_only" as const : "unknown" as const,
    };
  }

  async sendReply(input: OtaDirectReplyInput): Promise<OtaDirectReplyResult> {
    if (!directReplyEnabled()) throw new Error("Direct OTA reply is disabled by governance gate.");
    const response = await this.request(`/properties/${encodeURIComponent(input.propertyExternalId)}/conversations/${encodeURIComponent(input.conversationId)}`, {
      method: "POST",
      body: JSON.stringify({ message: { content: input.content, attachment_ids: [] } }),
    });
    const payload = await parseJson(response);
    const data = (payload.data && typeof payload.data === "object" ? payload.data : {}) as Record<string, unknown>;
    if (!response.ok) throw new Error(`Booking.com direct reply failed HTTP ${response.status}`);
    return {
      accepted: data.ok === true || data.ok === "true",
      providerMessageId: typeof data.message_id === "string" ? data.message_id : null,
      guestHasAccount: typeof data.guest_has_account === "boolean" ? data.guest_has_account : null,
      deliveryState: "accepted_pending_confirmation",
    };
  }
}

export class AgodaMessagingTransport implements OtaDirectMessagingTransport {
  readonly provider = "agoda" as const;

  readiness(): OtaDirectProviderReadiness {
    const configured = envSet("TCE_AGODA_SUPPLY_AUTHORIZATION");
    if (!configured) return { provider: this.provider, configured: false, historyReadCapable: false, replyCapable: false, reason: "MISSING_AGODA_SUPPLY_AUTH" };
    return {
      provider: this.provider,
      configured: true,
      historyReadCapable: true,
      replyCapable: directReplyEnabled(),
      reason: directReplyEnabled() ? "READY" : "DIRECT_REPLY_DISABLED",
    };
  }

  private async request(path: string, init?: RequestInit): Promise<Response> {
    const authorization = process.env.TCE_AGODA_SUPPLY_AUTHORIZATION?.trim();
    if (!authorization) throw new Error("Agoda Supply Connectivity authentication is not configured.");
    return fetch(`https://supply.agoda.com/api/v1/messaging${path}`, {
      ...init,
      headers: {
        Authorization: authorization,
        "Content-Type": "application/json; charset=utf-8",
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    });
  }

  async fetchConversation(input: { propertyExternalId: string; conversationId: string; pageId?: string | null }) {
    const query = input.pageId ? `?page_id=${encodeURIComponent(input.pageId)}` : "";
    const response = await this.request(`/properties/${encodeURIComponent(input.propertyExternalId)}/conversations/${encodeURIComponent(input.conversationId)}${query}`);
    const payload = await parseJson(response);
    if (!response.ok) throw new Error(`Agoda conversation read failed HTTP ${response.status}`);
    const data = (payload.data && typeof payload.data === "object" ? payload.data : {}) as Record<string, unknown>;
    const conversation = (data.conversation && typeof data.conversation === "object" ? data.conversation : {}) as Record<string, unknown>;
    const rawMessages = Array.isArray(conversation.messages) ? conversation.messages : [];
    const messages: OtaDirectMessage[] = rawMessages.flatMap((raw) => {
      if (!raw || typeof raw !== "object") return [];
      const item = raw as Record<string, unknown>;
      const messageId = String(item.message_id ?? "").trim();
      const content = String(item.content ?? "").trim();
      const createdAt = String(item.timestamp ?? "").trim();
      if (!messageId || !content || !createdAt) return [];
      const sender = String(item.sender_type ?? "").toLowerCase();
      return [{
        provider: "agoda",
        channel: "agoda",
        propertyExternalId: input.propertyExternalId,
        conversationId: input.conversationId,
        reservationReference: typeof conversation.conversation_reference === "string" ? conversation.conversation_reference : null,
        messageId,
        participant: sender === "guest" ? "guest" : sender === "property" ? "property" : "provider",
        content,
        createdAt,
      }];
    });
    return {
      messages,
      nextPageId: typeof data.next_page_id === "string" ? data.next_page_id : null,
      access: conversation.access === "read_write" ? "read_write" as const : conversation.access === "read_only" ? "read_only" as const : "unknown" as const,
    };
  }

  async sendReply(input: OtaDirectReplyInput): Promise<OtaDirectReplyResult> {
    if (!directReplyEnabled()) throw new Error("Direct OTA reply is disabled by governance gate.");
    const response = await this.request(`/properties/${encodeURIComponent(input.propertyExternalId)}/conversations/${encodeURIComponent(input.conversationId)}`, {
      method: "POST",
      body: JSON.stringify({ message: { content: input.content, attachment_ids: [] } }),
    });
    const payload = await parseJson(response);
    const data = (payload.data && typeof payload.data === "object" ? payload.data : {}) as Record<string, unknown>;
    if (response.status !== 202) throw new Error(`Agoda direct reply failed HTTP ${response.status}`);
    return {
      accepted: data.ok === true,
      providerMessageId: typeof data.message_id === "string" ? data.message_id : null,
      guestHasAccount: typeof data.guest_has_account === "boolean" ? data.guest_has_account : null,
      deliveryState: "accepted_pending_confirmation",
    };
  }
}

export class HotelLinkMessagingTransport implements OtaDirectMessagingTransport {
  readonly provider = "hotellink" as const;
  readiness(): OtaDirectProviderReadiness {
    return { provider: this.provider, configured: false, historyReadCapable: false, replyCapable: false, reason: "HOTELLINK_NO_DOCUMENTED_API" };
  }
  async fetchConversation(): Promise<never> {
    throw new Error("Hotel Link OTA Messaging has no documented API contract configured for TUAN OS.");
  }
  async sendReply(): Promise<never> {
    throw new Error("Hotel Link direct reply is HOLD until a documented API/partner integration is verified.");
  }
}

export function otaDirectProviderReadiness(): OtaDirectProviderReadiness[] {
  return [
    new BookingMessagingTransport().readiness(),
    new AgodaMessagingTransport().readiness(),
    new HotelLinkMessagingTransport().readiness(),
  ];
}


export function createOtaDirectTransport(provider: OtaDirectProvider): OtaDirectMessagingTransport {
  if (provider === "booking") return new BookingMessagingTransport();
  if (provider === "agoda") return new AgodaMessagingTransport();
  return new HotelLinkMessagingTransport();
}
