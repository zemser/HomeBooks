import type { Metadata } from "next";

import { PRODUCT_NAME } from "@/lib/brand";

import "./globals.css";

export const metadata: Metadata = {
  title: PRODUCT_NAME,
  description: "Private household money for the people who live here.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
