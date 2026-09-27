"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { DemoLink } from "./demo-link";
import { MARKETING_NAV } from "./nav";
import { Wordmark } from "./wordmark";


type Props = { demoHref: string; demoReady: boolean; pendingReason: string };

/**
 * 固定ヘッダー。スクロール時に白背景と区切り線を付ける。
 * モバイルでも「デモを試す」はヘッダー内に残し、ナビゲーションだけを開閉メニューにする。
 * メニューは Esc・外側操作・項目選択で閉じ、開いている間はフォーカスをメニュー内に留める。
 */
export function MarketingHeader({ demoHref, demoReady, pendingReason }: Props) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const close = useCallback((restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) toggleRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    panel?.querySelector<HTMLElement>("a,button")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      // メニューとトグルボタンの間でフォーカスを循環させる
      const items = [toggleRef.current, ...panel.querySelectorAll<HTMLElement>("a,button")].filter(
        (el): el is HTMLElement => el !== null,
      );
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!panel?.contains(t) && !toggleRef.current?.contains(t)) close(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open, close]);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 h-[72px] border-b transition-colors",
        scrolled || open ? "border-mk-line bg-white" : "border-transparent bg-white/0",
      )}
    >
      <div className="mx-auto flex h-full w-full max-w-[1200px] items-center justify-between gap-4 px-5 md:px-10 lg:px-16">
        <Link href="/" className="rounded-md" aria-label="Next AI Agent トップ">
          <Wordmark compact />
        </Link>

        <nav aria-label="ページ内" className="hidden lg:block">
          <ul className="flex items-center gap-1">
            {MARKETING_NAV.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  className="rounded-md px-3 py-2 text-[15px] text-mk-muted transition-colors hover:text-mk-ink"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-2">
          <DemoLink href={demoHref} placement="header" ready={demoReady} size="sm" pendingReason={pendingReason} />
          <button
            ref={toggleRef}
            type="button"
            className="inline-flex size-10 items-center justify-center rounded-md text-mk-ink hover:bg-mk-surface lg:hidden"
            aria-expanded={open}
            aria-controls="mk-mobile-menu"
            aria-label={open ? "メニューを閉じる" : "メニューを開く"}
            onClick={() => (open ? close() : setOpen(true))}
          >
            {open ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
          </button>
        </div>
      </div>

      <div
        id="mk-mobile-menu"
        ref={panelRef}
        hidden={!open}
        className="border-b border-mk-line bg-white px-5 pb-6 pt-2 shadow-sm lg:hidden"
      >
        <nav aria-label="ページ内（モバイル）">
          <ul className="flex flex-col">
            {MARKETING_NAV.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  onClick={() => close(false)}
                  className="block border-b border-mk-line py-4 text-base text-mk-ink"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
