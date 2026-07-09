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

export const properties: Property[] = [
  {
    id: "lavender-homestay",
    name: "Lavender Homestay",
    status: "online",
    occupancy: 92,
    checkInsToday: 2,
    checkOutsToday: 1,
    pendingGuestMessages: 3,
  },
  {
    id: "ruby-homestay",
    name: "Ruby Homestay",
    status: "monitoring",
    occupancy: 78,
    checkInsToday: 1,
    checkOutsToday: 0,
    pendingGuestMessages: 1,
  },
  {
    id: "cozy-garden",
    name: "Cozy Garden",
    status: "online",
    occupancy: 100,
    checkInsToday: 0,
    checkOutsToday: 2,
    pendingGuestMessages: 0,
  },
];
