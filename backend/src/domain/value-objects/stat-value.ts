import { type Brand, createBrand } from "./utils/brand.js";
import { ensure } from "./utils/rule-violation.js";

/** level・life・power・durability の値。DB では smallint に入れる。 */
export type StatValue = Brand<number, "StatValue">;

export const StatValue = createBrand<StatValue>((v) =>
  ensure(Number.isInteger(v) && v >= 0 && v <= 32767, `数値が 0〜32767 の整数ではない: ${v}`),
);
