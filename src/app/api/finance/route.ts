import { createBusinessUnitHandlers } from "@/server/api/business-unit-handlers";

export const { GET, POST } = createBusinessUnitHandlers("finance-ai", "Finance AI");
