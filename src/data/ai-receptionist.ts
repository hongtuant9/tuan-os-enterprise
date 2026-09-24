export type ReceptionistMode = "off" | "simulation" | "shadow" | "limited_auto" | "live";
export type CustomerCarePhase = "pre_service" | "in_service" | "post_service" | "general";
export type ConversationStatus =
  | "new"
  | "active"
  | "waiting_guest"
  | "needs_manager"
  | "booking_created"
  | "closed";
export type ManagerReviewStatus = "pending" | "approved" | "rejected" | "needs_info";
export type KnowledgeCandidateStatus = "pending" | "approved" | "rejected" | "published";

export type ReceptionistMessage = {
  id: string;
  direction: "inbound" | "outbound" | "internal";
  senderType: "guest" | "ai" | "manager" | "system";
  content: string;
  translatedVi: string;
  detectedLanguage?: string;
  status: "received" | "draft" | "simulated" | "sent" | "failed";
  createdAt: string;
};

export type ReceptionistConversation = {
  id: string;
  channel: string;
  externalConversationId: string;
  customerName: string;
  customerContact: string;
  propertyId: string | null;
  propertyName: string | null;
  language: string;
  intent: string;
  routedAgent: string;
  journeyEntry: string;
  carePhase: CustomerCarePhase;
  reservationReference: string | null;
  upsellOffers: string[];
  status: ConversationStatus;
  mode: ReceptionistMode;
  lastMessageAt: string;
  messages: ReceptionistMessage[];
};

export type AiBookingRecord = {
  id: string;
  conversationId: string;
  propertyName: string | null;
  guestName: string;
  guestContact: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  roomCount: number;
  roomClassName: string;
  quotedPrice: number | null;
  currency: string;
  bookingNote: string;
  kiotVietCode: string;
  status: string;
  verificationStatus: string;
  createdAt: string;
};

export type ManagerReview = {
  id: string;
  conversationId: string;
  title: string;
  guestRequest: string;
  reason: string;
  missingFields: string[];
  recommendation: string;
  proposedReply: string;
  riskLevel: "low" | "medium" | "high";
  status: ManagerReviewStatus;
  managerNote: string;
  createdAt: string;
  decidedAt: string | null;
};

export type KnowledgeCandidate = {
  id: string;
  fieldKey: string;
  title: string;
  proposedValue: unknown;
  scope: "one_time" | "reusable";
  status: KnowledgeCandidateStatus;
  reviewerNote: string;
  createdAt: string;
};

export type ReceptionistDashboard = {
  mode: ReceptionistMode;
  writeEnabled: boolean;
  conversations: ReceptionistConversation[];
  bookings: AiBookingRecord[];
  managerReviews: ManagerReview[];
  knowledgeCandidates: KnowledgeCandidate[];
  metrics: {
    openConversations: number;
    pendingManagerReviews: number;
    verifiedAiBookings: number;
    pendingKnowledgeCandidates: number;
  };
  missingDataBacklog: string[];
};

export type PilotMessageInput = {
  channel: "website" | "facebook" | "instagram" | "booking" | "agoda" | "airbnb" | "expedia" | "tripadvisor" | "email" | "whatsapp" | "zalo" | "other" | "pilot";
  externalConversationId?: string;
  externalMessageId?: string;
  customerName?: string;
  customerContact?: string;
  propertyId?: string | null;
  content: string;
  scenarioTag?: string;
  acquisitionSource?: string;
  utmSource?: string;
  utmCampaign?: string;
  referralSource?: string;
  pageEntity?: "tce" | "lavender" | "ruby" | "cozy" | "unknown";
  carePhase?: CustomerCarePhase;
  reservationReference?: string;
  providerMessageType?: string;
  reservationContext?: {
    checkInText?: string | null;
    checkOutText?: string | null;
    specialRequest?: string | null;
  };
  forceAssistMode?: boolean;
  testerUserId?: string | null;
};

export type ManagerDecisionInput = {
  reviewId: string;
  decision: Exclude<ManagerReviewStatus, "pending">;
  note: string;
  actorUserId: string;
  actorLabel: string;
};
