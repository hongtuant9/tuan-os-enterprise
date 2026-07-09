export type LogType = "info" | "action" | "approval" | "alert";

export type LogEntry = {
  id: string;
  timestamp: string;
  agent: string;
  unit: string;
  message: string;
  type: LogType;
};

export const logs: LogEntry[] = [
  {
    id: "log-01",
    timestamp: "2026-07-09T08:02:00+07:00",
    agent: "Reception AI",
    unit: "Hospitality AI",
    message: "Answered guest inquiry about late check-out at Lavender Homestay.",
    type: "action",
  },
  {
    id: "log-02",
    timestamp: "2026-07-09T07:45:00+07:00",
    agent: "Marketing AI",
    unit: "Marketing AI",
    message: "Drafted Instagram caption for Cozy Garden weekend promo.",
    type: "action",
  },
  {
    id: "log-03",
    timestamp: "2026-07-09T07:12:00+07:00",
    agent: "Reception AI",
    unit: "Hospitality AI",
    message: "Requested CEO approval for a 15% loyalty discount.",
    type: "approval",
  },
  {
    id: "log-04",
    timestamp: "2026-07-09T06:58:00+07:00",
    agent: "Finance AI",
    unit: "Finance AI",
    message: "Flagged mismatched payout amount from Booking.com for review.",
    type: "alert",
  },
  {
    id: "log-05",
    timestamp: "2026-07-09T06:30:00+07:00",
    agent: "CEO Assistant AI",
    unit: "CEO Overview",
    message: "Compiled daily priority brief for CEO review.",
    type: "info",
  },
  {
    id: "log-06",
    timestamp: "2026-07-08T22:15:00+07:00",
    agent: "iSTEAM AI",
    unit: "iSTEAM AI",
    message: "Updated enrollment tracker with 3 new leads.",
    type: "info",
  },
];
