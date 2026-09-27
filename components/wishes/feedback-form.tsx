"use client";

import { useId, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  FEEDBACK_OUTCOMES,
  OUTCOME_LABELS,
  PURCHASED_FROM,
  PURCHASED_FROM_LABELS,
  SKIP_REASON_LABELS,
  SKIP_REASONS,
  type FeedbackInput,
} from "@/lib/schemas/feedback";
import { LIMITS } from "@/lib/schemas/limits";

type Props = {
  wishVersion: number;
  defaultSourceId?: "rakuten" | "amazon" | null;
  onSubmit: (input: FeedbackInput) => Promise<void>;
  onCancel?: () => void;
};

/**
 * 任意の結果報告。「購入した」は本人の自己申告であり、注文の確認ではない。
 * 注文番号・領収書・決済情報は求めない。
 */
export function FeedbackForm({ wishVersion, defaultSourceId = null, onSubmit, onCancel }: Props) {
  const uid = useId();
  const [outcome, setOutcome] = useState<FeedbackInput["outcome"] | null>(null);
  const [from, setFrom] = useState<FeedbackInput["purchasedFrom"]>(defaultSourceId);
  const [reasons, setReasons] = useState<FeedbackInput["skipReasons"]>([]);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (done) return <Alert variant="info">記録しました。ご協力ありがとうございます。</Alert>;

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!outcome) return;
        setBusy(true);
        setError(null);
        try {
          await onSubmit({
            wishVersion,
            outcome,
            purchasedFrom: outcome === "purchased" ? (from ?? "no_answer") : null,
            skipReasons: outcome === "skipped" ? reasons : [],
            comment: comment.trim() ? comment.trim() : null,
            sourceId: defaultSourceId,
          });
          setDone(true);
        } catch (err) {
          setError(err instanceof Error ? err.message : "記録できませんでした。");
        } finally {
          setBusy(false);
        }
      }}
    >
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 text-sm font-medium">結果（任意）</legend>
        {FEEDBACK_OUTCOMES.map((o) => (
          <label key={o} className="flex items-center gap-2 text-sm">
            <input type="radio" name={`${uid}-outcome`} checked={outcome === o} onChange={() => setOutcome(o)} />
            {OUTCOME_LABELS[o]}
          </label>
        ))}
      </fieldset>

      {outcome === "purchased" && (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1 text-sm font-medium">購入先</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {PURCHASED_FROM.map((p) => (
              <label key={p} className="flex items-center gap-2 text-sm">
                <input type="radio" name={`${uid}-from`} checked={from === p} onChange={() => setFrom(p)} />
                {PURCHASED_FROM_LABELS[p]}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {outcome === "skipped" && (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1 text-sm font-medium">見送った理由（複数選択可）</legend>
          <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
            {SKIP_REASONS.map((r) => (
              <label key={r} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={reasons.includes(r)}
                  onChange={(e) => setReasons(e.target.checked ? [...reasons, r] : reasons.filter((x) => x !== r))}
                />
                {SKIP_REASON_LABELS[r]}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {outcome && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${uid}-comment`}>ひとこと（任意・{LIMITS.feedbackCommentMaxChars}文字まで）</Label>
          <Textarea
            id={`${uid}-comment`}
            rows={2}
            maxLength={LIMITS.feedbackCommentMaxChars}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="注文番号や個人情報は入力しないでください"
          />
        </div>
      )}

      {error && <Alert variant="destructive">{error}</Alert>}
      <div className="flex gap-2">
        <Button type="submit" disabled={!outcome || busy}>
          記録する
        </Button>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            今は答えない
          </Button>
        )}
      </div>
    </form>
  );
}
