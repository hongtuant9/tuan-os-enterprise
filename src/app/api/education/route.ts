import { createBusinessUnitHandlers } from "@/server/api/business-unit-handlers";

// "Education" is the public API name for the iSTEAM AI business unit.
export const { GET, POST } = createBusinessUnitHandlers("isteam-ai", "iSTEAM AI");
