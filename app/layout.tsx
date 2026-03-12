import type { Metadata } from "next";
import "./globals.css";
import "./responsive.css";
import MainLayout from "@/components/layout/MainLayout";

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
      <body className="antialiased">
        <MainLayout>{children}</MainLayout>
      </body>
    </html>
  );
}
