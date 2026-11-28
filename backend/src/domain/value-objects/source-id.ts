import { type Brand, createBrand } from "./utils/brand.js";
import { ensure } from "./utils/rule-violation.js";

/**
 * 取得元（api.gatcg.com）が振った id。取得元が振り直すことがあるので、こちらの id にはしない。
 * 大文字小文字を区別する。小文字にそろえない。
 */
export type SourceId = Brand<string, "SourceId">;

export const SourceId = createBrand<SourceId>((v) =>
  ensure(v.length > 0 && v.trim() === v, `SourceId が空か、前後に空白がある: "${v}"`),
);
