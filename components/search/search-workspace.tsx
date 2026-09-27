"use client";

import { Save, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAppState } from "@/components/providers/app-state";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FeedbackForm } from "@/components/wishes/feedback-form";
import { WishClientError } from "@/lib/client/wish-client";
import type { PurchaseWish } from "@/lib/schemas/wish";
import { ChatPanel } from "./chat-panel";
import { ConditionsForm } from "./conditions-form";
import { ResultsPanel } from "./results-panel";

function toRef(wish: PurchaseWish, contextToken: string | null) {
  const { id, version, title, userId: _u, status: _s, lastSearchedAt: _l, createdAt: _c, updatedAt: _up, ...conditions } = wish;
  void _u;
  void _s;
  void _l;
  void _c;
  void _up;
  return { wishId: id, version, title, conditions: { ...conditions, title }, contextToken };
}

export function SearchWorkspace() {
  const app = useAppState();
  const {
    config,
    draft,
    setDraft,
    savedRef,
    setSavedRef,
    isDirty,
    search,
    runSearch,
    signedIn,
    wishClient,
    pendingMessage,
    setPendingMessage,
    autoSearch,
    setAutoSearch,
    pendingSaveAfterLogin,
    setPendingSaveAfterLogin,
    outbound,
    clearOutbound,
  } = app;
  const router = useRouter();
  const [saveState, setSaveState] = useState<{ kind: "idle" | "saving" | "saved" | "error"; message?: string }>({ kind: "idle" });
  const [conflict, setConflict] = useState<PurchaseWish | null>(null);
  const [showFeedbackPrompt, setShowFeedbackPrompt] = useState(false);
  const started = useRef(false);

  // ホームからの入力・保存済み希望からの再検索を1回だけ実行する
  useEffect(() => {
    if (started.current) return;
    if (pendingMessage) {
      started.current = true;
      const m = pendingMessage;
      setPendingMessage(null);
      void runSearch(m);
    } else if (autoSearch) {
      started.current = true;
      setAutoSearch(false);
      void runSearch(null);
    }
  }, [pendingMessage, autoSearch, runSearch, setPendingMessage, setAutoSearch]);

  // 外部サイトから戻った時に、任意の結果報告を案内する（回答は強制しない）
  useEffect(() => {
    if (!outbound) return;
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - outbound.at > 3000) setShowFeedbackPrompt(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [outbound]);

  const save = async (overwriteVersion?: number) => {
    if (!signedIn) {
      setPendingSaveAfterLogin(true);
      router.push("/login");
      return;
    }
    setSaveState({ kind: "saving" });
    setConflict(null);
    try {
      if (savedRef) {
        const wish = await wishClient.updateConditions(savedRef.wishId, overwriteVersion ?? savedRef.version, draft);
        setSavedRef(toRef(wish, savedRef.contextToken));
        setDraft({ ...draft, title: wish.title });
        setSaveState({ kind: "saved", message: "変更を保存しました。" });
      } else {
        const wish = await wishClient.create(draft);
        setSavedRef(toRef(wish, null));
        setDraft({ ...draft, title: wish.title });
        setSaveState({ kind: "saved", message: `「${wish.title}」として保存しました。` });
      }
      setPendingSaveAfterLogin(false);
    } catch (e) {
      if (e instanceof WishClientError && e.code === "version_conflict" && e.current) {
        setConflict(e.current);
        setSaveState({ kind: "error", message: e.message });
      } else if (e instanceof WishClientError && e.status === 401) {
        setPendingSaveAfterLogin(true);
        router.push("/login");
      } else {
        setSaveState({ kind: "error", message: e instanceof Error ? e.message : "保存できませんでした。" });
      }
    }
  };

  const running = search.status === "running";

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">相談・検索</h1>

      {savedRef && (
        <Alert variant="info">
          保存済みの希望「{savedRef.title}」の条件で探しています。
          {isDirty ? (
            <strong className="ml-1">未保存の変更があります（保存済みの条件は変わっていません）。</strong>
          ) : (
            <span className="ml-1">保存済みの条件と同じです。</span>
          )}
        </Alert>
      )}

      {pendingSaveAfterLogin && signedIn && (
        <Alert variant="info" className="flex flex-wrap items-center gap-2">
          <span>ログインしました。入力中の条件を保存できます。</span>
          <Button size="sm" onClick={() => void save()}>
            この条件を保存
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setPendingSaveAfterLogin(false)}>
            あとで
          </Button>
        </Alert>
      )}

      {showFeedbackPrompt && outbound && (
        <Alert variant="info" className="flex flex-col gap-3">
          {savedRef && outbound.wishId === savedRef.wishId && outbound.version !== null ? (
            <>
              <p>販売ページでの検討はいかがでしたか？（任意・自己申告）</p>
              <FeedbackForm
                wishVersion={outbound.version}
                defaultSourceId={outbound.sourceId}
                onSubmit={async (input) => {
                  await wishClient.addFeedback(outbound.wishId!, input);
                }}
                onCancel={() => {
                  setShowFeedbackPrompt(false);
                  clearOutbound();
                }}
              />
            </>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <p>条件を保存すると、検討の結果を記録して次回の探し直しに役立てられます。</p>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setShowFeedbackPrompt(false);
                  clearOutbound();
                }}
              >
                閉じる
              </Button>
            </div>
          )}
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <div className="flex flex-col gap-6">
          <ChatPanel />

          <section aria-labelledby="conditions-heading" className="flex flex-col gap-3 rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <h2 id="conditions-heading" className="text-base font-semibold">
                条件
              </h2>
              {config.aiMode !== "none" && (
                <span className="text-xs text-muted-foreground">読み取った条件は候補です。確認・修正してください。</span>
              )}
            </div>
            <ConditionsForm value={draft} onChange={setDraft} category={config.category} showTitle />
            <div className="flex flex-wrap gap-2 pt-2">
              <Button onClick={() => void runSearch(null)} disabled={running}>
                <Search aria-hidden />
                この条件で探す
              </Button>
              <Button
                variant="outline"
                onClick={() => void save()}
                disabled={saveState.kind === "saving" || (savedRef !== null && !isDirty)}
              >
                <Save aria-hidden />
                {savedRef ? "変更を保存" : "この条件を保存"}
              </Button>
            </div>
            {!signedIn && (
              <p className="text-xs text-muted-foreground">
                保存するにはログインが必要です。{config.mode === "demo" && "デモでは認証せず、このタブのメモリにだけ保存します。"}
              </p>
            )}
            <p className="text-xs text-muted-foreground">保存した条件は自動では検索・購入されません。</p>
            <div aria-live="polite">
              {saveState.kind === "saved" && (
                <p className="text-sm text-success">
                  {saveState.message}{" "}
                  <Link href="/wishes" className="underline">
                    マイ希望を見る
                  </Link>
                </p>
              )}
              {saveState.kind === "error" && <p className="text-sm text-destructive">{saveState.message}</p>}
            </div>
            {conflict && (
              <Alert variant="warning" className="flex flex-col gap-2">
                <p>別の画面で条件が更新されています（保存済みの版：{conflict.version}）。</p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const ref = toRef(conflict, savedRef?.contextToken ?? null);
                      setSavedRef(ref);
                      setDraft(ref.conditions);
                      setConflict(null);
                      setSaveState({ kind: "idle" });
                    }}
                  >
                    最新の条件を読み込む
                  </Button>
                  <Button size="sm" onClick={() => void save(conflict.version)}>
                    この画面の内容で上書き保存
                  </Button>
                </div>
              </Alert>
            )}
          </section>
        </div>

        <section aria-labelledby="results-heading" className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 id="results-heading" className="text-base font-semibold">
              候補
            </h2>
            {search.keywords && <span className="text-xs text-muted-foreground">検索語：{search.keywords}</span>}
          </div>
          <p className="sr-only" aria-live="polite" role="status">
            {search.stageMessage}
          </p>
          {running && (
            <p className="text-sm text-muted-foreground" aria-hidden>
              {search.stageMessage}…
            </p>
          )}
          {search.status === "aborted" && <Alert variant="warning">{search.stageMessage}</Alert>}
          {search.status === "failed" && search.error && <Alert variant="destructive">{search.error.message}</Alert>}
          <ResultsPanel />
          <p className="text-xs text-muted-foreground">
            表示は接続先の公開情報です。価格・在庫・配送は変わることがあり、購入時は各販売ページの表示が適用されます。
          </p>
        </section>
      </div>
    </div>
  );
}
