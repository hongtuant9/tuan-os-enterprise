import "server-only";

export const BFL_FLUX_2_PRO_MODEL = "flux-2-pro";
const BFL_API_BASE = "https://api.bfl.ai";
const BFL_CREDIT_USD = 0.01;
const POLL_INTERVAL_MS = 1500;
const POLL_ATTEMPTS = 80;

type SubmitResponse = {
  id?: string;
  polling_url?: string;
  cost?: number;
  input_mp?: number;
  output_mp?: number;
  detail?: unknown;
};

type ResultResponse = {
  status?: string;
  result?: {
    sample?: string;
    seed?: number;
    prompt?: string;
  };
  error?: string;
};

function requiredBflKey(): string {
  const key = process.env.BFL_API_KEY?.trim();
  if (!key) throw new Error("BFL_API_KEY SET=no");
  return key;
}

function safeBflError(value: unknown): string {
  const message =
    value instanceof Error ? value.message : String(value ?? "BFL API error");
  return message.replace(/[A-Za-z0-9_-]{24,}/g, "[REDACTED]").slice(0, 500);
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function editImageWithFlux2Pro(input: {
  sourceBuffer: Buffer;
  prompt: string;
  width: number;
  height: number;
  outputFormat?: "jpeg" | "png" | "webp";
}) {
  const apiKey = requiredBflKey();
  const response = await fetch(`${BFL_API_BASE}/v1/flux-2-pro`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-key": apiKey,
    },
    body: JSON.stringify({
      prompt: input.prompt,
      input_image: input.sourceBuffer.toString("base64"),
      width: input.width,
      height: input.height,
      safety_tolerance: 2,
      output_format: input.outputFormat ?? "jpeg",
    }),
  });

  const submitted = (await response.json()) as SubmitResponse;
  if (!response.ok) {
    throw new Error(
      `BFL FLUX.2 Pro submit ${response.status}: ${safeBflError(
        JSON.stringify(submitted.detail ?? submitted),
      )}`,
    );
  }

  const pollingUrl = submitted.polling_url?.trim();
  if (!submitted.id || !pollingUrl) {
    throw new Error("BFL FLUX.2 Pro không trả generation id/polling_url.");
  }

  let result: ResultResponse | null = null;
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
    if (attempt > 0) await delay(POLL_INTERVAL_MS);
    const poll = await fetch(pollingUrl, { headers: { "x-key": apiKey } });
    const payload = (await poll.json()) as ResultResponse;
    if (!poll.ok) {
      throw new Error(
        `BFL FLUX.2 Pro poll ${poll.status}: ${safeBflError(
          JSON.stringify(payload),
        )}`,
      );
    }
    const status = payload.status?.toLowerCase();
    if (status === "ready") {
      result = payload;
      break;
    }
    if (status === "error" || status === "failed") {
      throw new Error(
        `BFL FLUX.2 Pro generation failed: ${safeBflError(payload.error)}`,
      );
    }
  }

  const sampleUrl = result?.result?.sample?.trim();
  if (!sampleUrl) {
    throw new Error("BFL FLUX.2 Pro timeout hoặc chưa trả ảnh kết quả.");
  }

  const output = await fetch(sampleUrl);
  if (!output.ok) {
    throw new Error(`Không tải được ảnh FLUX output: HTTP ${output.status}`);
  }
  const outputBuffer = Buffer.from(await output.arrayBuffer());
  if (!outputBuffer.length) throw new Error("FLUX output rỗng.");

  const credits = Math.max(0, Number(submitted.cost ?? 0));
  return {
    outputBuffer,
    generationId: submitted.id,
    model: BFL_FLUX_2_PRO_MODEL,
    costCredits: credits,
    costUsd: credits * BFL_CREDIT_USD,
    inputMp: Math.max(0, Number(submitted.input_mp ?? 0)),
    outputMp: Math.max(0, Number(submitted.output_mp ?? 0)),
    seed: result?.result?.seed,
    resultPrompt: result?.result?.prompt ?? "",
  };
}
