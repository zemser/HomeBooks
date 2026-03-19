import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fin App",
  description: "Couples and families finance workspace scaffold",
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

