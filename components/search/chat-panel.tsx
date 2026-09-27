"use client";

import { Send, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAppState } from "@/components/providers/app-state";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LIMITS } from "@/lib/schemas/limits";
import { cn } from "@/lib/utils";

export function ChatPanel() {
  const { config, chat, search, runSearch, cancelSearch } = useAppState();
  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const running = search.status === "running";
  const aiAvailable = config.aiMode !== "none";

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [chat.length]);

  const submit = () => {
    const t = text.trim();
    if (!t || running) return;
    setText("");
    void runSearch(t);
  };

  return (
    <section aria-labelledby="chat-heading" className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 id="chat-heading" className="text-base font-semibold">
          希望を伝える
        </h2>
        <span className="text-xs text-muted-foreground">
          {config.aiMode === "llm"
            ? "AI（Claude）が条件を読み取ります"
            : config.aiMode === "demo_parser"
              ? "デモ用の簡易解析（AI不使用）"
              : "AIは現在利用できません"}
        </span>
      </div>

      {chat.length > 0 && (
        <div ref={listRef} className="flex max-h-72 flex-col gap-2 overflow-y-auto rounded-lg border p-3" aria-label="会話">
          {chat.map((m) => (
            <div
              key={m.id}
              className={cn(
                "max-w-[90%] rounded-lg px-3 py-2 text-sm",
                m.role === "user" ? "self-end bg-primary text-primary-foreground" : "self-start bg-muted",
                m.kind === "error" && "border border-destructive/40 bg-destructive/10 text-foreground",
                m.kind === "note" && "bg-transparent text-xs text-muted-foreground",
              )}
            >
              <p className="whitespace-pre-wrap break-words">{m.text}</p>
              {m.questions && m.questions.length > 0 && (
                <ul className="mt-1 list-disc pl-5">
                  {m.questions.map((q) => (
                    <li key={q}>{q}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Label htmlFor="chat-input" className="sr-only">
          希望や条件の変更
        </Label>
        <Textarea
          id="chat-input"
          value={text}
          rows={2}
          maxLength={LIMITS.messageMaxChars}
          disabled={!aiAvailable}
          placeholder={
            aiAvailable
              ? chat.length === 0
                ? `例：${config.category.inputExample}`
                : "例：幅は80cmまで／予算を解除"
              : "条件フォームで指定して検索してください"
          }
          onChange={(e) => setText(e.target.value.slice(0, LIMITS.messageMaxChars))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground" aria-live="off">
            {text.length}/{LIMITS.messageMaxChars}
          </span>
          {running ? (
            <Button variant="outline" onClick={cancelSearch}>
              <Square aria-hidden />
              中止
            </Button>
          ) : (
            <Button type="submit" disabled={!aiAvailable || !text.trim()}>
              <Send aria-hidden />
              送信
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">会話はこのタブの中だけで扱い、保存しません。</p>
      </form>
    </section>
  );
}
