"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "./Logo";
import type { SharedAccountKey } from "@/lib/actingAs";

function IconBase({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[18px] w-[18px] shrink-0"
    >
      {children}
    </svg>
  );
}

function HomeIcon() {
  return (
    <IconBase>
      <path d="M3.5 11.5 12 4l8.5 7.5" />
      <path d="M5.5 10v9a1 1 0 0 0 1 1H9v-6h6v6h2.5a1 1 0 0 0 1-1v-9" />
    </IconBase>
  );
}

function ListIcon() {
  return (
    <IconBase>
      <line x1="4" y1="6" x2="4.01" y2="6" />
      <line x1="8" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="4.01" y2="12" />
      <line x1="8" y1="12" x2="20" y2="12" />
      <line x1="4" y1="18" x2="4.01" y2="18" />
      <line x1="8" y1="18" x2="20" y2="18" />
    </IconBase>
  );
}

function PhoneIcon() {
  return (
    <IconBase>
      <rect x="7" y="2.5" width="10" height="19" rx="2.2" />
      <line x1="11" y1="18" x2="13" y2="18" />
    </IconBase>
  );
}

function ChartIcon() {
  return (
    <IconBase>
      <line x1="5" y1="20" x2="5" y2="13" />
      <line x1="12" y1="20" x2="12" y2="7" />
      <line x1="19" y1="20" x2="19" y2="4" />
      <line x1="3" y1="21" x2="21" y2="21" />
    </IconBase>
  );
}

function MeetingIcon() {
  return (
    <IconBase>
      <rect x="3.5" y="4.5" width="17" height="16" rx="2" />
      <line x1="3.5" y1="9.5" x2="20.5" y2="9.5" />
      <line x1="8" y1="2.5" x2="8" y2="6.5" />
      <line x1="16" y1="2.5" x2="16" y2="6.5" />
    </IconBase>
  );
}

function ScriptIcon() {
  return (
    <IconBase>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <line x1="8" y1="8" x2="16" y2="8" />
      <line x1="8" y1="12" x2="16" y2="12" />
      <line x1="8" y1="16" x2="13" y2="16" />
    </IconBase>
  );
}

function UpsellIcon() {
  return (
    <IconBase>
      <polyline points="4 16.5 9.5 11 13 14.5 20 7.5" />
      <polyline points="15 7.5 20 7.5 20 12.5" />
    </IconBase>
  );
}

function ShiftIcon() {
  return (
    <IconBase>
      <rect x="3.5" y="4.5" width="17" height="16" rx="2" />
      <line x1="3.5" y1="9.5" x2="20.5" y2="9.5" />
      <line x1="7.5" y1="13" x2="7.5" y2="17" />
      <line x1="12" y1="13" x2="12" y2="17" />
      <line x1="16.5" y1="13" x2="16.5" y2="15.5" />
    </IconBase>
  );
}

const NAV_ITEMS = [
  { href: "/", label: "ホーム", icon: HomeIcon },
  { href: "/leads", label: "リード一覧", icon: ListIcon },
  { href: "/calls", label: "架電状況", icon: PhoneIcon },
  { href: "/deal-report", label: "商談報告×Hubspot", icon: ChartIcon },
  { href: "/sales-meeting", label: "営業定例MTG", icon: MeetingIcon },
  { href: "/talk-script", label: "トークスクリプト", icon: ScriptIcon },
];

// 統括担当者（管理者）専用の項目。isSupervisor=falseなら表示しない。
const ADMIN_NAV_ITEMS = [{ href: "/shift-management", label: "シフト管理表", icon: ShiftIcon }];

// アップセルは統括担当者に限らず、UPSELL_USER_EMAILSの営業担当に表示する。
const UPSELL_NAV_ITEM = { href: "/admin/upsell-extract", label: "アップセル", icon: UpsellIcon };

// シェアレジ担当者はリードのメモ記録だけを行うため、オンコール営業向けの項目は表示しない。
const SHAREREGI_VISIBLE_HREFS = new Set(["/leads"]);

export default function Sidebar({
  sharedAccountKey = null,
  isSupervisor = false,
  showUpsell = false,
}: {
  sharedAccountKey?: SharedAccountKey | null;
  isSupervisor?: boolean;
  showUpsell?: boolean;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const baseItems =
    sharedAccountKey === "shareregi"
      ? NAV_ITEMS.filter((item) => SHAREREGI_VISIBLE_HREFS.has(item.href))
      : NAV_ITEMS;
  const navItems = [
    ...baseItems,
    ...(isSupervisor ? ADMIN_NAV_ITEMS : []),
    ...(showUpsell ? [UPSELL_NAV_ITEM] : []),
  ];

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        title="サイドバーを開く"
        className="fixed top-4 left-3 z-20 flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-foreground/50 shadow-sm transition hover:bg-brand-light hover:text-brand"
      >
        »
      </button>
    );
  }

  return (
    <aside className="m-3 flex w-60 shrink-0 flex-col gap-1 rounded-2xl border border-border bg-surface px-3 py-5 shadow-sm">
      <div className="mb-6 flex items-center justify-between px-2">
        <Logo />
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          title="サイドバーを閉じる"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-foreground/40 transition hover:bg-brand-light hover:text-brand"
        >
          «
        </button>
      </div>
      {navItems.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all ${
              active
                ? "bg-brand-light font-semibold text-brand shadow-[0_2px_8px_-2px_rgba(14,176,206,0.35)] ring-1 ring-brand/15"
                : "font-medium text-foreground/60 hover:bg-brand-light/60 hover:text-brand"
            }`}
          >
            <Icon />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </aside>
  );
}
