import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TUAN OS — Trung tâm Điều hành",
  description: "TUAN OS — trung tâm điều hành doanh nghiệp và AI Agent",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body className="antialiased">{children}</body>
    </html>
  );
}
