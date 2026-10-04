import type { Metadata } from "next";
import { cookies } from "next/headers";
import FeedbackClient from "./FeedbackClient";

export const metadata: Metadata = {
  title: "Share your experience — Cozy Garden Tam Coc",
  description: "Tell us about your experience at Cozy Garden Tam Coc.",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function CozyFeedbackPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const cookieStore = await cookies();
  const tableCookie = cookieStore.get("tce_cozy_table")?.value ?? "";

  return (
    <FeedbackClient
      tableParam={one(params.table)}
      tableCookie={tableCookie}
      qrId={one(params.qr_id)}
      source={one(params.source) || "table_qr"}
    />
  );
}
