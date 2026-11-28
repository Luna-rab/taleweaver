import { type Brand, createBrand } from "./utils/brand.js";
import { ensure } from "./utils/rule-violation.js";

/**
 * 取得元が面やエディションに付ける名前つきの識別子（例: lorraine-blademaster）。
 * 取得元が id を振り直したときの照合と、カードの参照先の指定に使う。
 */
export type Slug = Brand<string, "Slug">;

export const Slug = createBrand<Slug>((v) =>
  ensure(/^\S+$/.test(v), `Slug が空か、空白を含む: "${v}"`),
);
