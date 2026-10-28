"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, LoaderCircle, ShoppingBasket, UserRound, UtensilsCrossed } from "lucide-react";
import { useApp } from "./app-provider";

const tabs = [
  { href: "/planner", label: "安排", icon: UtensilsCrossed },
  { href: "/library", label: "菜库", icon: BookOpen },
  { href: "/shopping", label: "清单", icon: ShoppingBasket },
  { href: "/settings", label: "我的", icon: UserRound }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { loading, loadError, refreshApp, toastState } = useApp();

  if (loading) {
    return (
      <div className="app-frame boot-frame">
        <div className="boot-seal">明</div>
        <p className="boot-title">正在摆好餐桌</p>
        <LoaderCircle className="spin" size={20} />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="app-frame boot-frame">
        <div className="boot-seal muted">明</div>
        <p className="boot-title">餐桌还没准备好</p>
        <p className="boot-message">{loadError}</p>
        <button className="btn btn-primary compact" onClick={() => void refreshApp()}>
          重新连接
        </button>
      </div>
    );
  }

  return (
    <div className="app-frame">
      <main className="app-main">{children}</main>
      <nav className="tabbar" aria-label="主导航">
        {tabs.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          const Icon = tab.icon;
          return (
            <Link key={tab.href} href={tab.href} className={`tab ${active ? "active" : ""}`} aria-current={active ? "page" : undefined}>
              <Icon size={21} strokeWidth={1.7} />
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className={`toast ${toastState ? "show" : ""} ${toastState?.kind ?? ""}`} role="status" aria-live="polite">
        {toastState?.message}
      </div>
    </div>
  );
}
