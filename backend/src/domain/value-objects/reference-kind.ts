import { type Brand, createBrand } from "./utils/brand.js";
import { ensure } from "./utils/rule-violation.js";

/**
 * 参照の種類（SUMMON・MASTERY・GENERATE など）。取得元が種類を足しても拒否しないよう、列挙にしない。
 */
export type ReferenceKind = Brand<string, "ReferenceKind">;

export const ReferenceKind = createBrand<ReferenceKind>((v) =>
  ensure(v.trim().length > 0, "参照の種類が空"),
);
