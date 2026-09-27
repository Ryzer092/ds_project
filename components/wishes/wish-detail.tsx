"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useAppState } from "@/components/providers/app-state";
import { ConditionsForm } from "@/components/search/conditions-form";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { formatDateTime, summarizeConditions } from "@/lib/client/conditions-edit";
import { WishClientError } from "@/lib/client/wish-client";
import { OUTCOME_LABELS, PURCHASED_FROM_LABELS, SKIP_REASON_LABELS, type Feedback } from "@/lib/schemas/feedback";
import { conditionsEqual, type PurchaseWish, type WishConditions } from "@/lib/schemas/wish";
import { FeedbackForm } from "./feedback-form";
import { STATUS_LABEL, useStartResearch } from "./wish-list";

function conditionsOf(w: PurchaseWish): WishConditions {
  return {
    title: w.title,
    categoryId: w.categoryId,
    productType: w.productType,
    purpose: w.purpose,
    budgetJpy: w.budgetJpy,
    budgetScope: w.budgetScope,
    quantity: w.quantity,
    condition: w.condition,
    required: w.required,
    preferences: w.preferences,
    wantedBy: w.wantedBy,
  };
}

export function WishDetail({ id, startEditing }: { id: string; startEditing: boolean }) {
  const { config, wishClient, signedIn, authReady } = useAppState();
  const router = useRouter();
  const research = useStartResearch();
  const [wish, setWish] = useState<PurchaseWish | null>(null);
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [edit, setEdit] = useState<WishConditions | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [conflict, setConflict] = useState<PurchaseWish | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(
    (openEditor = false) =>
      wishClient.get(id).then(
        (r) => {
          setWish(r.wish);
          setFeedback(r.feedback);
          if (openEditor) setEdit(conditionsOf(r.wish));
        },
        (e: unknown) => {
          if (e instanceof WishClientError && (e.status === 404 || e.status === 401)) setNotFound(true);
          else setError(e instanceof Error ? e.message : "読み込めませんでした。");
        },
      ),
    [wishClient, id],
  );

  useEffect(() => {
    if (!authReady || !signedIn) return;
    void load(startEditing);
  }, [authReady, signedIn, load, startEditing]);

  if (authReady && !signedIn) {
    return (
      <Alert className="flex flex-wrap items-center gap-2">
        <span>この希望を表示するにはログインが必要です。</span>
        <Link href="/login" className={buttonVariants({ size: "sm" })}>
          ログイン
        </Link>
      </Alert>
    );
  }
  if (notFound) {
    return (
      <div className="flex flex-col gap-3">
        <Alert>希望が見つかりません。削除されたか、表示する権限がありません。</Alert>
        <Link href="/wishes" className="underline">
          マイ希望へ戻る
        </Link>
      </div>
    );
  }
  if (!wish) return <p className="text-sm text-muted-foreground">{error ?? "読み込み中…"}</p>;

  const saveEdit = async (version: number) => {
    if (!edit) return;
    setConflict(null);
    try {
      const w = await wishClient.updateConditions(wish.id, version, edit);
      setWish(w);
      setEdit(null);
      setMessage("条件を保存しました。");
    } catch (e) {
      if (e instanceof WishClientError && e.code === "version_conflict" && e.current) setConflict(e.current);
      else setError(e instanceof Error ? e.message : "保存できませんでした。");
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold">{wish.title}</h1>
          <Badge variant="secondary">{STATUS_LABEL[wish.status]}</Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          条件の版 {wish.version}／更新：{formatDateTime(wish.updatedAt)}
          {wish.lastSearchedAt && `／直近の検索：${formatDateTime(wish.lastSearchedAt)}`}
        </p>
        <p className="text-sm text-muted-foreground">保存した条件は自動では検索・購入されません。</p>
      </div>

      <div aria-live="polite">
        {message && <Alert variant="info">{message}</Alert>}
        {error && <Alert variant="destructive">{error}</Alert>}
      </div>

      <section aria-labelledby="cond-h" className="flex flex-col gap-3 rounded-lg border p-4">
        <h2 id="cond-h" className="text-base font-semibold">
          保存した条件
        </h2>
        {edit ? (
          <>
            <ConditionsForm value={edit} onChange={setEdit} category={config.category} showTitle />
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void saveEdit(wish.version)} disabled={conditionsEqual(edit, conditionsOf(wish))}>
                変更を保存
              </Button>
              <Button variant="ghost" onClick={() => setEdit(null)}>
                キャンセル
              </Button>
            </div>
            {conflict && (
              <Alert variant="warning" className="flex flex-col gap-2">
                <p>別の画面で条件が更新されています。</p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setWish(conflict);
                      setEdit(conditionsOf(conflict));
                      setConflict(null);
                    }}
                  >
                    最新の条件を読み込む
                  </Button>
                  <Button size="sm" onClick={() => void saveEdit(conflict.version)}>
                    この内容で上書き保存
                  </Button>
                </div>
              </Alert>
            )}
          </>
        ) : (
          <>
            <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
              {summarizeConditions(wish, config.category).map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void research(wish.id).catch((e) => setError(e.message))}>
                <Search aria-hidden />
                この条件で探す
              </Button>
              <Button variant="outline" onClick={() => setEdit(conditionsOf(wish))}>
                条件を編集
              </Button>
              {wish.status !== "completed" && (
                <Button
                  variant="ghost"
                  onClick={async () => {
                    setWish(await wishClient.updateStatus(wish.id, "completed"));
                  }}
                >
                  この希望を終了
                </Button>
              )}
              <Button
                variant="ghost"
                className="text-destructive"
                onClick={async () => {
                  if (!window.confirm("この希望を削除しますか？条件の履歴と結果報告も削除されます。")) return;
                  await wishClient.remove(wish.id);
                  router.push("/wishes");
                }}
              >
                削除
              </Button>
            </div>
          </>
        )}
      </section>

      <section aria-labelledby="fb-h" className="flex flex-col gap-3 rounded-lg border p-4">
        <h2 id="fb-h" className="text-base font-semibold">
          結果の記録（任意）
        </h2>
        <p className="text-xs text-muted-foreground">
          「購入した」は本人の自己申告として記録し、外部ECでの注文を確認したものではありません。リンクを開いただけでは記録されません。
        </p>
        <FeedbackForm
          key={feedback.length}
          wishVersion={wish.version}
          onSubmit={async (input) => {
            await wishClient.addFeedback(wish.id, input);
            await load();
          }}
        />
        {feedback.length > 0 && (
          <ul className="flex flex-col gap-2 border-t pt-3 text-sm">
            {feedback.map((f) => (
              <li key={f.id} className="flex flex-col gap-0.5">
                <span>
                  {OUTCOME_LABELS[f.outcome]}
                  {f.purchasedFrom && `（${PURCHASED_FROM_LABELS[f.purchasedFrom]}）`}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {formatDateTime(f.createdAt)}・条件の版 {f.wishVersion}
                  </span>
                </span>
                {f.skipReasons.length > 0 && (
                  <span className="text-xs text-muted-foreground">理由：{f.skipReasons.map((r) => SKIP_REASON_LABELS[r]).join("、")}</span>
                )}
                {f.comment && <span className="text-xs text-muted-foreground">{f.comment}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
