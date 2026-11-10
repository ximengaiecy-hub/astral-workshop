import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "星界工坊 · 桌面模型与卡牌",
  description: "挑选 DND 模组与通用遭遇棋子，浏览实体卡牌与定制卡册，查看套餐内容与制作价格。",
  icons: { icon: "/assets/demo-logo.svg", apple: "/assets/demo-logo.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
