export type BusinessUnitStatus = "online" | "monitoring" | "idle" | "offline";

export type BusinessUnit = {
  id: string;
  slug: string;
  name: string;
  description: string;
  status: BusinessUnitStatus;
};
