"use client";

import { X } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { CategoryConfig } from "@/lib/categories";
import { getRequired, setSingleRequired, toggleTextRequired } from "@/lib/client/conditions-edit";
import { COLOR_VOCABULARY } from "@/lib/search/colors";
import { LIMITS } from "@/lib/schemas/limits";
import type { RequiredOp, WishConditions } from "@/lib/schemas/wish";

type Props = {
  value: WishConditions;
  onChange: (next: WishConditions) => void;
  category: CategoryConfig;
  showTitle?: boolean;
};

const OP_OPTIONS: Array<{ value: RequiredOp; label: string }> = [
  { value: "lte", label: "以内" },
  { value: "gte", label: "以上" },
  { value: "eq", label: "くらい（±1cm）" },
];

/**
 * 購入条件の編集フォーム。AIが読み取った条件もここで本人が確認・修正する。
 * 入力は常に全体を置き換える形で親へ返す（未保存の状態は親が管理する）。
 */
export function ConditionsForm({ value, onChange, category, showTitle = false }: Props) {
  const uid = useId();
  const id = (k: string) => `${uid}-${k}`;
  const [prefInput, setPrefInput] = useState("");
  const set = <K extends keyof WishConditions>(key: K, v: WishConditions[K]) => onChange({ ...value, [key]: v });

  const colorReq = getRequired(value, "color")[0] ?? null;
  const textAttrs = category.attributes.filter((a) => a.kind === "text");
  const dimAttrs = category.attributes.filter((a) => a.kind === "dimension");

  return (
    <div className="flex flex-col gap-4">
      {showTitle && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={id("title")}>タイトル（任意）</Label>
          <Input
            id={id("title")}
            value={value.title}
            maxLength={LIMITS.titleMaxChars}
            placeholder="空欄の場合は条件から自動で作成します"
            onChange={(e) => set("title", e.target.value)}
          />
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={id("type")}>商品種類</Label>
          <Select
            id={id("type")}
            value={value.productType ?? ""}
            onChange={(e) => set("productType", e.target.value || null)}
          >
            <option value="">{category.label}（指定なし）</option>
            {category.productTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
            {value.productType && !category.productTypes.includes(value.productType) && (
              <option value={value.productType}>{value.productType}</option>
            )}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={id("purpose")}>用途（任意）</Label>
          <Input
            id={id("purpose")}
            value={value.purpose ?? ""}
            maxLength={LIMITS.purposeMaxChars}
            placeholder="例：在宅勤務用"
            onChange={(e) => set("purpose", e.target.value ? e.target.value : null)}
          />
        </div>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">予算</legend>
        <div className="flex items-center gap-2">
          <Input
            id={id("budget")}
            type="number"
            inputMode="numeric"
            min={1}
            max={LIMITS.budgetMaxJpy}
            step={100}
            aria-label="予算（円）"
            className="max-w-40"
            value={value.budgetJpy ?? ""}
            placeholder="指定なし"
            onChange={(e) => {
              const n = e.target.value === "" ? null : Math.floor(Number(e.target.value));
              set("budgetJpy", n !== null && Number.isFinite(n) && n >= 1 ? Math.min(n, LIMITS.budgetMaxJpy) : null);
            }}
          />
          <span className="text-sm">円まで</span>
          {value.budgetJpy !== null && (
            <Button variant="ghost" size="sm" onClick={() => onChange({ ...value, budgetJpy: null, budgetScope: "unspecified" })}>
              予算を解除
            </Button>
          )}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm" role="radiogroup" aria-label="予算の範囲">
          {(
            [
              ["delivered_total", "送料込みの総額"],
              ["item", "本体価格のみ"],
              ["unspecified", "指定しない"],
            ] as const
          ).map(([v, label]) => (
            <label key={v} className="flex items-center gap-1.5">
              <input
                type="radio"
                name={id("scope")}
                value={v}
                checked={value.budgetScope === v}
                onChange={() => set("budgetScope", v)}
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">サイズ（必須条件）</legend>
        {dimAttrs.map((attr) => {
          const reqs = getRequired(value, attr.key);
          const current = reqs[0] ?? null;
          return (
            <div key={attr.key} className="flex flex-wrap items-center gap-2">
              <Label htmlFor={id(attr.key)} className="w-14">
                {attr.label}
              </Label>
              <Input
                id={id(attr.key)}
                type="number"
                inputMode="decimal"
                min={attr.min}
                max={attr.max}
                step={0.5}
                className="w-24"
                placeholder="—"
                value={current && typeof current.value === "number" ? current.value : ""}
                onChange={(e) => {
                  const n = e.target.value === "" ? null : Number(e.target.value);
                  onChange(
                    setSingleRequired(
                      value,
                      attr.key,
                      n !== null && Number.isFinite(n) ? { op: current?.op ?? "lte", value: n, unit: "cm" } : null,
                    ),
                  );
                }}
              />
              <span className="text-sm">cm</span>
              <Select
                aria-label={`${attr.label}の指定方法`}
                className="w-36"
                value={current?.op ?? "lte"}
                disabled={!current}
                onChange={(e) =>
                  current && onChange(setSingleRequired(value, attr.key, { ...current, op: e.target.value as RequiredOp }))
                }
              >
                {OP_OPTIONS.filter((o) => attr.ops.includes(o.value)).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
              {reqs.length > 1 && <span className="text-xs text-muted-foreground">（複数の指定を1つにまとめます）</span>}
            </div>
          );
        })}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={id("color")}>色（必須条件）</Label>
          <div className="flex gap-2">
            <Select
              id={id("color")}
              value={colorReq && typeof colorReq.value === "string" ? colorReq.value : ""}
              onChange={(e) =>
                onChange(
                  setSingleRequired(
                    value,
                    "color",
                    e.target.value ? { op: colorReq?.op ?? "eq", value: e.target.value, unit: null } : null,
                  ),
                )
              }
            >
              <option value="">指定なし</option>
              {COLOR_VOCABULARY.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Select
              aria-label="色の指定方法"
              className="w-32"
              value={colorReq?.op ?? "eq"}
              disabled={!colorReq}
              onChange={(e) =>
                colorReq && onChange(setSingleRequired(value, "color", { ...colorReq, op: e.target.value as RequiredOp }))
              }
            >
              <option value="eq">この色</option>
              <option value="exclude">この色以外</option>
            </Select>
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={id("condition")}>状態</Label>
          <Select
            id={id("condition")}
            value={value.condition}
            onChange={(e) => set("condition", e.target.value as WishConditions["condition"])}
          >
            <option value="any">問わない</option>
            <option value="new">新品</option>
            <option value="used">中古</option>
            <option value="refurbished">整備品</option>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={id("qty")}>数量</Label>
          <Input
            id={id("qty")}
            type="number"
            inputMode="numeric"
            min={1}
            max={LIMITS.quantityMax}
            className="w-24"
            value={value.quantity}
            onChange={(e) => {
              const n = Math.floor(Number(e.target.value));
              set("quantity", Number.isFinite(n) ? Math.min(Math.max(n, 1), LIMITS.quantityMax) : 1);
            }}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={id("wanted")}>希望時期（任意）</Label>
          <div className="flex items-center gap-2">
            <Input
              id={id("wanted")}
              type="date"
              className="w-44"
              value={value.wantedBy ?? ""}
              onChange={(e) => set("wantedBy", e.target.value || null)}
            />
            <span className="text-sm">までに</span>
          </div>
        </div>
      </div>

      {textAttrs.map((attr) =>
        attr.kind === "text" ? (
          <fieldset key={attr.key} className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">{attr.label}（必須条件）</legend>
            <div className="flex flex-wrap gap-2">
              {attr.suggestions.map((s) => {
                const on = value.required.some((r) => r.key === attr.key && r.value === s && r.op === "contains");
                return (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={on}
                    onClick={() => onChange(toggleTextRequired(value, attr.key, s))}
                    className={
                      on
                        ? "rounded-full border border-primary bg-primary px-3 py-1 text-sm text-primary-foreground"
                        : "rounded-full border px-3 py-1 text-sm hover:bg-accent"
                    }
                  >
                    {s}
                  </button>
                );
              })}
              {value.required
                .filter((r) => r.key === attr.key && !(r.op === "contains" && attr.suggestions.includes(String(r.value))))
                .map((r) => (
                  <span key={`${r.op}-${r.value}`} className="flex items-center gap-1 rounded-full border px-3 py-1 text-sm">
                    {r.op === "exclude" ? `「${r.value}」を除く` : String(r.value)}
                    <button
                      type="button"
                      aria-label={`${r.value}の条件を外す`}
                      onClick={() => onChange(toggleTextRequired(value, attr.key, String(r.value), r.op))}
                    >
                      <X className="size-3" aria-hidden />
                    </button>
                  </span>
                ))}
            </div>
          </fieldset>
        ) : null,
      )}

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">好み（できれば）</legend>
        <div className="flex flex-wrap gap-2">
          {value.preferences.map((p) => (
            <span key={p} className="flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-sm">
              {p}
              <button
                type="button"
                aria-label={`好み「${p}」を外す`}
                onClick={() => set("preferences", value.preferences.filter((x) => x !== p))}
              >
                <X className="size-3" aria-hidden />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            aria-label="好みを追加"
            value={prefInput}
            maxLength={LIMITS.preferenceMaxChars}
            placeholder="例：組み立てが簡単"
            disabled={value.preferences.length >= LIMITS.preferencesMax}
            onChange={(e) => setPrefInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addPref();
              }
            }}
          />
          <Button variant="outline" onClick={addPref} disabled={!prefInput.trim()}>
            追加
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">好みは候補の絞り込みには使わず、判断の参考として保存します。</p>
      </fieldset>
    </div>
  );

  function addPref() {
    const p = prefInput.trim();
    if (!p || value.preferences.includes(p) || value.preferences.length >= LIMITS.preferencesMax) return;
    set("preferences", [...value.preferences, p]);
    setPrefInput("");
  }
}
