export type PropertyStatus = "online" | "monitoring" | "offline";

export type Property = {
  id: string;
  name: string;
  status: PropertyStatus;
  occupancy: number;
  checkInsToday: number;
  checkOutsToday: number;
  pendingGuestMessages: number;
};
