import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PA Skate Parks",
  description: "Find and share skate parks across Pennsylvania",
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
