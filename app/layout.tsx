import type { Metadata } from "next";
import "./globals.css";
import "./responsive.css";

export const metadata: Metadata = {
  title: "Sellometrix.io",
  description: "AI Commerce OS - Amazon Seller Dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' }}
        className="antialiased"
      >
        {children}
      </body>
    </html>
  );
}
