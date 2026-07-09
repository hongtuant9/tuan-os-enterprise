import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TUAN OS Enterprise",
  description: "TUAN OS Enterprise Dashboard",
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
