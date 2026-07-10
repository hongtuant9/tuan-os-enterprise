import { NextResponse } from "next/server";
import { authenticateApiRequest } from "@/server/auth/api-auth";
import { GoogleOAuthTokenStore } from "@/server/integrations/google/token-store";

export async function GET(request: Request) {
  const principal = await authenticateApiRequest(request);
  if (!principal) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const connected = await new GoogleOAuthTokenStore().isConnected();
  return NextResponse.json({ connected });
}
