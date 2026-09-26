import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tổng quan điều hành | TUAN OS",
  description: "TUAN OS — trung tâm điều hành doanh nghiệp và hệ thống trợ lý AI",
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
