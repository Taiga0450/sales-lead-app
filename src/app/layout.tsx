import type { Metadata } from "next";
import { Noto_Sans_JP } from "next/font/google";
import "./globals.css";
import GlobalProgressBar from "@/components/GlobalProgressBar";

const notoSansJP = Noto_Sans_JP({
  variable: "--font-noto-sans-jp",
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"],
});

export const metadata: Metadata = {
  title: "OnCall Leads",
  description: "潜在顧客のリサーチ・分析・アウトリーチ管理ツール",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className={`${notoSansJP.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {/* 保存・読み込み・画面遷移の進捗バー（全画面共通） */}
        <GlobalProgressBar />
        {children}
      </body>
    </html>
  );
}
