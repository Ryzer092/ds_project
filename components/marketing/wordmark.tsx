/**
 * 正式ロゴ未提供のための独自のシンプルなワードマーク。
 * compact: 360px未満の画面では文字を隠してアイコンだけにする（ヘッダーのCTAを優先）。
 */
export function Wordmark({ inverse = false, compact = false }: { inverse?: boolean; compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden className="shrink-0">
        <rect width="26" height="26" rx="7" fill={inverse ? "#7AD996" : "#17663A"} />
        <path
          d="M8 18V8.5l10 9V8"
          fill="none"
          stroke={inverse ? "#0F3A24" : "#FFFFFF"}
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span
        className={`${inverse ? "text-white" : "text-mk-ink"} font-semibold tracking-tight ${compact ? "max-[359px]:sr-only" : ""}`}
      >
        Next AI Agent
      </span>
    </span>
  );
}
