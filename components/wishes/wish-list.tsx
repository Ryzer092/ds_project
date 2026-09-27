"use client";

import { Pause, Pencil, Play, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useAppState } from "@/components/providers/app-state";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime, summarizeConditions } from "@/lib/client/conditions-edit";
import { WishClientError } from "@/lib/client/wish-client";
import { LIMITS } from "@/lib/schemas/limits";
import type { PurchaseWish, WishStatus } from "@/lib/schemas/wish";

export const STATUS_LABEL: Record<WishStatus, string> = {
  active: "保存中",
  paused: "休止中",
  completed: "終了",
  archived: "アーカイブ",
};

export function useStartResearch() {
  const { wishClient, startFromWish, setAutoSearch } = useAppState();
  const router = useRouter();
  return useCallback(
    async (id: string) => {
      const { contextToken, wish } = await wishClient.searchContext(id);
      startFromWish(wish, contextToken);
      setAutoSearch(true);
      router.push("/search");
    },
    [wishClient, startFromWish, setAutoSearch, router],
  );
}

export function WishList() {
  const { config, wishClient, signedIn, authReady } = useAppState();
  const [wishes, setWishes] = useState<PurchaseWish[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);
  const needLogin = (authReady && !signedIn) || unauthorized;
  const research = useStartResearch();

  const load = useCallback(
    () =>
      wishClient.list().then(
        (list) => {
          setWishes(list);
          setError(null);
        },
        (e: unknown) => {
          if (e instanceof WishClientError && e.status === 401) setUnauthorized(true);
          else setError(e instanceof Error ? e.message : "読み込めませんでした。");
        },
      ),
    [wishClient],
  );

  useEffect(() => {
    if (!authReady || !signedIn) return;
    void load();
  }, [authReady, signedIn, load]);

  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "処理できませんでした。");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        保存した条件は自動では検索・購入されません。「この条件で探す」を押したときに、その時点の候補を取得します。
      </p>
      {config.mode === "demo" && <Alert variant="warning">デモ：保存した希望はこのタブのメモリだけにあり、再読み込みで消えます。</Alert>}
      {needLogin ? (
        <Alert className="flex flex-wrap items-center gap-2">
          <span>購入希望を保存・表示するにはログインが必要です。</span>
          <Link href="/login" className={buttonVariants({ size: "sm" })}>
            ログイン
          </Link>
        </Alert>
      ) : (
        <>
          {error && <Alert variant="destructive">{error}</Alert>}
          {wishes === null && !error && <p className="text-sm text-muted-foreground">読み込み中…</p>}
          {wishes?.length === 0 && (
            <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed p-6">
              <p className="text-sm">まだ保存した希望はありません。</p>
              <Link href="/search" className={buttonVariants()}>
                希望を入力して探す
              </Link>
            </div>
          )}
          {wishes && wishes.length > 0 && (
            <>
              <p className="text-xs text-muted-foreground">
                {wishes.length}/{LIMITS.wishesPerUser}件
              </p>
              <ul className="grid gap-3 md:grid-cols-2">
                {wishes.map((w) => (
                  <li key={w.id}>
                    <Card className="h-full">
                      <CardHeader>
                        <div className="flex items-start justify-between gap-2">
                          <CardTitle>
                            <Link href={`/wishes/${w.id}`} className="hover:underline">
                              {w.title}
                            </Link>
                          </CardTitle>
                          <Badge variant={w.status === "active" ? "secondary" : "outline"}>{STATUS_LABEL[w.status]}</Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="flex flex-col gap-2">
                        <p className="text-sm">{summarizeConditions(w, config.category).join("・")}</p>
                        <p className="text-xs text-muted-foreground">
                          更新：{formatDateTime(w.updatedAt)}
                          {w.lastSearchedAt ? `／直近の検索：${formatDateTime(w.lastSearchedAt)}` : "／まだ検索していません"}
                        </p>
                        {w.wantedBy && w.wantedBy < new Date().toISOString().slice(0, 10) && (
                          <p className="text-xs text-warning">希望時期を過ぎています。条件の更新をご検討ください。</p>
                        )}
                      </CardContent>
                      <CardFooter className="flex-wrap">
                        <Button size="sm" onClick={() => void act(() => research(w.id))}>
                          <Search aria-hidden />
                          この条件で探す
                        </Button>
                        <Link href={`/wishes/${w.id}?edit=1`} className={buttonVariants({ size: "sm", variant: "outline" })}>
                          <Pencil aria-hidden />
                          条件を編集
                        </Link>
                        {w.status === "active" ? (
                          <Button size="sm" variant="ghost" onClick={() => void act(() => wishClient.updateStatus(w.id, "paused"))}>
                            <Pause aria-hidden />
                            いったん休止
                          </Button>
                        ) : (
                          <Button size="sm" variant="ghost" onClick={() => void act(() => wishClient.updateStatus(w.id, "active"))}>
                            <Play aria-hidden />
                            再開
                          </Button>
                        )}
                        {w.status !== "completed" && (
                          <Button size="sm" variant="ghost" onClick={() => void act(() => wishClient.updateStatus(w.id, "completed"))}>
                            終了
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive"
                          onClick={() => {
                            if (window.confirm(`「${w.title}」を削除しますか？条件の履歴と結果報告も削除されます。`)) {
                              void act(() => wishClient.remove(w.id));
                            }
                          }}
                        >
                          <Trash2 aria-hidden />
                          削除
                        </Button>
                      </CardFooter>
                    </Card>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  );
}
