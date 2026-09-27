import { describe, expect, it } from "vitest";
import { desksCategory } from "@/lib/categories/desks";
import type { DimensionAttribute } from "@/lib/categories/types";
import { readDimension } from "@/lib/search/dimensions";

const attr = (key: string) => desksCategory.attributes.find((a) => a.key === key) as DimensionAttribute;
const width = attr("width_cm");
const depth = attr("depth_cm");
const height = attr("height_cm");

describe("readDimension", () => {
  it("日本語ラベルの連続表記で単位を末尾から補う", () => {
    const t = "シンプルデスク 幅80×奥行45×高さ72cm ホワイト";
    expect(readDimension(t, "", width)?.values).toEqual([80]);
    expect(readDimension(t, "", depth)?.values).toEqual([45]);
    expect(readDimension(t, "", height)?.values).toEqual([72]);
  });

  it("W/D/H 表記を読み、幅・奥行き・高さを取り違えない", () => {
    const t = "パソコンデスク W90×D50×H70cm";
    expect(readDimension(t, "", width)?.values).toEqual([90]);
    expect(readDimension(t, "", depth)?.values).toEqual([50]);
    expect(readDimension(t, "", height)?.values).toEqual([70]);
  });

  it("x 区切りの W/D/H も読める", () => {
    expect(readDimension("デスク W120xD60xH72cm", "", width)?.values).toEqual([120]);
  });

  it("mm と m を cm に換算する", () => {
    expect(readDimension("幅900mm 奥行450mm", "", width)?.values).toEqual([90]);
    expect(readDimension("幅1.2m", "", width)?.values).toEqual([120]);
  });

  it("全角数字・全角単位を正規化する", () => {
    expect(readDimension("幅９０ｃｍ", "", width)?.values).toEqual([90]);
  });

  it("型番の数字を寸法にしない", () => {
    expect(readDimension("学習机 DK-9045 ホワイト", "", width)).toBeNull();
    expect(readDimension("デスク DW90 ホワイト", "", width)).toBeNull();
    expect(readDimension("デスク W90WH", "", width)).toBeNull();
  });

  it("ラベルのない寸法（90×45×72）は読まない", () => {
    expect(readDimension("デスク 90×45×72cm", "", width)).toBeNull();
  });

  it("単位のない値は推測しない", () => {
    expect(readDimension("幅90 ホワイト", "", width)).toBeNull();
  });

  it("サイズ違いは複数値、昇降は範囲として返す", () => {
    expect(readDimension("コンパクトデスク 幅60/80/100cm", "", width)?.values).toEqual([60, 80, 100]);
    expect(readDimension("高さ60〜125cm", "", height)?.ranges).toEqual([[60, 125]]);
  });

  it("引き出し内寸などの部位寸法を本体寸法にしない", () => {
    expect(readDimension("", "引き出し内寸 幅30cm", width)).toBeNull();
  });

  it("商品名に記載があれば商品名を優先し、なければ説明から読む", () => {
    expect(readDimension("デスク 幅80cm", "幅120cmタイプもあります", width)).toMatchObject({ values: [80], from: "title" });
    expect(readDimension("デスク", "サイズ：幅100cm", width)).toMatchObject({ values: [100], from: "body" });
  });

  it("範囲外の値は捨てる", () => {
    expect(readDimension("幅3cm", "", width)).toBeNull();
  });
});
