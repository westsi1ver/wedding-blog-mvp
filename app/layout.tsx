import "./globals.css";

export const metadata = {
  title: "레몬과 깔라만씨의 Wedding Blog Assistant",
  description: "웨딩스냅 작가를 위한 네이버 블로그 분석 & 원고 작성 도구",
  icons: { icon: "/icon.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="ko"><body>{children}</body></html>;
}
