import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HWPX 서식 변환",
  description: "HWPX 문서의 글꼴, 크기, 줄 간격과 문단 서식을 간편하게 변경하세요.",
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
