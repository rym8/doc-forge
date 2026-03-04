import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Doc Forge",
  description: "Refine documents through LLM conversations",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
