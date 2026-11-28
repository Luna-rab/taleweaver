import { type Brand, createBrand } from "./utils/brand.js";
import { ensure } from "./utils/rule-violation.js";

/** セット内のカード番号。"001A" のような番号があるので文字列で持つ。セット内で一意ではない（絵違いがある）。 */
export type CollectorNumber = Brand<string, "CollectorNumber">;

export const CollectorNumber = createBrand<CollectorNumber>((v) =>
  ensure(/^\S+$/.test(v), `カード番号が空か、空白を含む: "${v}"`),
);
