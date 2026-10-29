import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "한글 도우미",
  description: "HWPX 서식 변환, 한글 단축키 검색, 서식 공유와 자주 쓰는 수식을 한곳에서 관리하세요.",
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
