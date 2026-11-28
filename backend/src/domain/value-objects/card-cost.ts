import { type Brand, createBrand } from "./utils/brand.js";
import { ensure } from "./utils/rule-violation.js";

/**
 * カードのコスト。メモリーコストとリザーブコストは別の資源なので、種類を値と一緒に持つ。
 * X コストは数値と混ぜず "X" で表す（取得元は -1 で返すので、並べ替えに -1 が混ざらないようにする）。
 */
export type CardCost = Brand<
  { readonly type: "memory" | "reserve"; readonly value: number | "X" } | { readonly type: "none" },
  "CardCost"
>;

export const CardCost = createBrand<CardCost>((v) => {
  if (v.type === "none") return;
  ensure(
    v.value === "X" || (Number.isInteger(v.value) && v.value >= 0),
    `コストが 0 以上の整数でも X でもない: ${String(v.value)}`,
  );
});
