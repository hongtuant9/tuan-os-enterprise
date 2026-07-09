import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TUAN OS Command Center",
  description: "TUAN OS Command Center — unified control for every AI-run business unit",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
