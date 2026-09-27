"use client";

import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAppState } from "@/components/providers/app-state";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LIMITS } from "@/lib/schemas/limits";

/** ホームの入力。登録を強制せず、入力内容はURLに載せずタブ内メモリで検索画面へ渡す。 */
export function HomeStart() {
  const { config, setPendingMessage, resetSession } = useAppState();
  const router = useRouter();
  const [text, setText] = useState("");
  const canUseText = config.aiMode !== "none";

  const start = () => {
    resetSession();
    if (canUseText && text.trim()) setPendingMessage(text.trim());
    router.push("/search");
  };

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start();
      }}
    >
      <Label htmlFor="home-wish">欲しいものと条件</Label>
      <Textarea
        id="home-wish"
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, LIMITS.messageMaxChars))}
        placeholder={`例：${config.category.inputExample}`}
        rows={3}
        maxLength={LIMITS.messageMaxChars}
        disabled={!canUseText}
        aria-describedby="home-wish-help"
      />
      <p id="home-wish-help" className="text-xs text-muted-foreground">
        {canUseText
          ? `${config.category.scopeDescription}登録しなくても試せます。`
          : "AIによる読み取りは現在利用できません。次の画面の条件フォームで指定して検索できます。"}
      </p>
      <div>
        <Button type="submit" size="lg">
          {canUseText ? "この希望で探す" : "条件を指定して探す"}
          <ArrowRight aria-hidden />
        </Button>
      </div>
    </form>
  );
}
