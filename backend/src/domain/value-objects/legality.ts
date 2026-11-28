import { type Brand, createBrand } from "./utils/brand.js";
import { ensure } from "./utils/rule-violation.js";

/**
 * フォーマットごとの、デッキに入れられる枚数の上限（0 は禁止）。
 * 載っていないフォーマットは制限なし。
 */
export type Legality = Brand<Readonly<Record<string, number>>, "Legality">;

export const Legality = createBrand<Legality>((v) => {
  for (const [format, limit] of Object.entries(v)) {
    ensure(format.length > 0, "フォーマット名が空");
    ensure(
      Number.isInteger(limit) && limit >= 0,
      `${format} の上限が 0 以上の整数ではない: ${limit}`,
    );
  }
});
