import { redirect } from "next/navigation";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function appendParam(target: URLSearchParams, key: string, value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    value.forEach((item) => target.append(key, item));
    return;
  }

  if (value !== undefined) target.set(key, value);
}

export default async function LegacyFeedbackRedirect({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => appendParam(query, key, value));

  const suffix = query.toString();
  redirect(suffix ? `/cozy/feedback?${suffix}` : "/cozy/feedback");
}
