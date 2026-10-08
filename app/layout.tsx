import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "천안 교통량 점검 지원",
  description: "오전 8시 교통량 품질 검토, 담당 배정과 정비 연락 시연",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="antialiased">{children}</body>
    </html>
  );
}
