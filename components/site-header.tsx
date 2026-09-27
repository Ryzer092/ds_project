"use client";

import { ListChecks, LogIn, Search, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAppState } from "@/components/providers/app-state";
import { cn } from "@/lib/utils";

export function SiteHeader() {
  const { config, signedIn, userEmail } = useAppState();
  const pathname = usePathname();
  const nav = [
    { href: "/search", label: "探す", icon: Search },
    { href: "/wishes", label: "マイ希望", icon: ListChecks },
    { href: "/settings", label: "設定", icon: Settings },
  ];
  return (
    <header className="border-b bg-background/95">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-2 px-4">
        <div className="flex items-center gap-3">
          <Link href="/app" className="font-semibold tracking-tight">
            {config.appName}
          </Link>
          <Link href="/" className="hidden text-xs text-muted-foreground underline-offset-2 hover:underline sm:inline">
            サービス紹介
          </Link>
        </div>
        <nav aria-label="メインメニュー" className="flex items-center gap-1">
          {nav.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={pathname.startsWith(href) ? "page" : undefined}
              className={cn(
                "flex items-center gap-1 rounded-md px-2 py-2 text-sm hover:bg-accent",
                pathname.startsWith(href) && "bg-accent font-medium",
              )}
            >
              <Icon className="size-4" aria-hidden />
              <span className="hidden sm:inline">{label}</span>
              <span className="sr-only sm:hidden">{label}</span>
            </Link>
          ))}
          {!signedIn && (config.authEnabled || config.mode === "demo") && (
            <Link href="/login" className="flex items-center gap-1 rounded-md px-2 py-2 text-sm hover:bg-accent">
              <LogIn className="size-4" aria-hidden />
              <span>ログイン</span>
            </Link>
          )}
          {signedIn && userEmail && (
            <span className="hidden max-w-40 truncate text-xs text-muted-foreground md:inline" title={userEmail}>
              {userEmail}
            </span>
          )}
        </nav>
      </div>
    </header>
  );
}
