import type { Metadata } from "next";
import SourceCaptureClient from "./SourceCaptureClient";

export const metadata: Metadata = {
  title: "Cozy Garden · Quick Source",
  robots: { index: false, follow: false },
};

export default function CozySourcePage() {
  return <SourceCaptureClient />;
}
