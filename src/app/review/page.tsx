import type { Metadata } from "next";
import ReviewClient from "./ReviewClient";

export const metadata: Metadata = {
  title: "Thank you — Cozy Garden Tam Coc",
  description: "Share your Cozy Garden Tam Coc experience on Google or Tripadvisor.",
  robots: {
    index: false,
    follow: false,
  },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function CozyReviewPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;

  return (
    <ReviewClient
      sid={one(params.sid)}
      rating={one(params.rating)}
      review={one(params.review)}
      feedback={one(params.feedback)}
      category={one(params.category)}
      issue={one(params.issue)}
    />
  );
}
