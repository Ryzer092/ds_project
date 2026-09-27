"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAppState } from "@/components/providers/app-state";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AccountPanel() {
  const { config, signedIn, userEmail, signOut, resetSession } = useAppState();
  const router = useRouter();
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "info" | "destructive"; text: string } | null>(null);

  if (!signedIn) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span>ログインしていません。</span>
        {(config.authEnabled || config.mode === "demo") && (
          <Link href="/login" className={buttonVariants({ size: "sm" })}>
            ログイン
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm">ログイン中：{userEmail}</p>
      <div>
        <Button
          variant="outline"
          onClick={async () => {
            await signOut();
            resetSession();
            router.push("/app");
          }}
        >
          ログアウト
        </Button>
      </div>

      {config.mode === "live" && (
        <div className="flex flex-col gap-2 rounded-lg border border-destructive/40 p-4">
          <h3 className="font-medium">アカウントの削除</h3>
          <p className="text-sm text-muted-foreground">
            アカウントと、保存した購入希望・条件の履歴・結果報告をすべて削除します。取り消せません。
            本人確認のため、直近10分以内にログインしている必要があります。
          </p>
          <Label htmlFor="delete-confirm">確認のため「削除する」と入力してください</Label>
          <Input id="delete-confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="max-w-60" />
          <div>
            <Button
              variant="destructive"
              disabled={confirm !== "削除する" || busy}
              onClick={async () => {
                setBusy(true);
                setMessage(null);
                const res = await fetch("/api/account", {
                  method: "DELETE",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ confirm }),
                });
                setBusy(false);
                if (res.ok) {
                  await signOut();
                  resetSession();
                  setMessage({ kind: "info", text: "アカウントを削除しました。" });
                  router.push("/app");
                  return;
                }
                const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
                setMessage({ kind: "destructive", text: body?.error?.message ?? "削除できませんでした。" });
              }}
            >
              アカウントを削除
            </Button>
          </div>
          {message && <Alert variant={message.kind}>{message.text}</Alert>}
        </div>
      )}
    </div>
  );
}
