import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppProvider } from "@/components/app-provider";

export const metadata: Metadata = {
  title: "明日菜单 · 家庭 AI 晚餐排程",
  description: "读取最近一周，用 AI 为家里安排明天的荤素晚餐，并自动生成采购清单。",
  robots: { index: false, follow: false, nocache: true },
  manifest: "/manifest.webmanifest",
  applicationName: "明日菜单",
  appleWebApp: { capable: true, title: "明日菜单", statusBarStyle: "default" }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1e2b24"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  );
}
