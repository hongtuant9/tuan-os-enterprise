type WebhookCheck = { ok: true } | { ok: false; status: number; error: string };

/**
 * Verifies a per-source shared secret for inbound webhooks. Fails closed:
 * an unset env var disables the endpoint (501) rather than accepting
 * unauthenticated calls.
 */
export function verifyWebhookSecret(
  request: Request,
  envVarName: string,
  headerName: string
): WebhookCheck {
  const expected = process.env[envVarName];
  if (!expected) {
    return { ok: false, status: 501, error: `${envVarName} is not configured` };
  }

  const provided = request.headers.get(headerName);
  if (!provided || provided !== expected) {
    return { ok: false, status: 401, error: "Invalid or missing webhook secret" };
  }

  return { ok: true };
}
